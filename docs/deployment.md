# Cloudflare 部署与复现

生产主入口为 [Cloudflare Pages](https://shichen-wellness.pages.dev/?mode=daily)，与杏林随诊采用同一类 Pages 托管方式。前端和 `/api/*` 使用同域地址；`pages/worker.mjs` 通过 `SHICHEN_API` Service Binding 调用本账号的 `shichen-wellness` Worker，不让手机直接连接 `workers.dev`。

本项目使用 Cloudflare Vite 插件构建 React 静态资源和 Worker。入口为 `worker/index.ts`，`wrangler.jsonc` 声明静态资源绑定、服务变量和限流绑定。部署需使用自己的 Cloudflare 账号；实际公开地址以成功部署输出为准。[Cloudflare Vite 官方入门](https://developers.cloudflare.com/workers/vite-plugin/get-started/)

## 本机准备

在仓库根目录，使用 Node.js 22.13.0 或更新版本：

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

开发默认地址为 `http://127.0.0.1:5174`。构建后执行 `npm run preview`，默认端口 4174。`npm test` 使用本地内容、模拟模型响应与模拟位置，不需要真实密钥。覆盖审计可能比其余单元测试耗时更长。

真实模型配置放在不入库的 `.dev.vars`。首次可复制 `.dev.vars.example`，在本机编辑器中填写；已有文件不要覆盖。智能体接口还需要独立的 `AGENT_API_KEY`。本地配置不会自动上传到部署后的 Worker；生产密钥须另外设置。

## 登录与首次部署

```sh
npm run cf:login
npx wrangler whoami
npm run deploy
```

`cf:login` 打开本机浏览器授权；完成后用 `whoami` 确认目标账号。检查 `wrangler.jsonc` 中 Worker 名称再部署，避免覆盖账号中同名的其他项目。`npm run deploy` 先构建，再运行 `wrangler deploy`。

首次部署可以不提供模型密钥：网页显示离线规则和模板，智能体接口因缺少其访问密钥返回 503。成功输出中的 URL 才是可分享地址；开发机的回环地址不能直接提供手机使用。

## 配置或更新服务器密钥

完成首次部署后，按命令提示交互输入，命令行参数中不包含密钥值：

```sh
npx wrangler secret put LLM_API_KEY
npx wrangler secret put AGENT_API_KEY
```

`LLM_API_KEY` 用于调用模型；`AGENT_API_KEY` 是独立生成的智能体访问凭据。非敏感模型名称、基础地址、超时和思考设置保存在 `wrangler.jsonc` 的 `vars`。不要将密钥写进 `vars`、`VITE_*` 环境变量、前端源码或提交记录。

`wrangler secret put` 会创建并立即部署新版本；更新现有密钥时也是如此。也可在 Cloudflare 控制台的 Worker 设置中添加 Secret。密钥应由维护者在本机操作，不能从公开文档复制所谓示例真值。[Cloudflare Secrets 官方说明](https://developers.cloudflare.com/workers/configuration/secrets/)

再次修改代码后，运行检查与测试，再执行 `npm run deploy`。部署前后的版本与结果应保留在维护者自己的发布记录中，不在公开仓库保存秘密文件或认证凭据。

## 发布 Pages 手机入口

先完成上面的 Worker 部署和 Secret 配置。首次在目标账号创建独立 Pages 项目（不要复用已有的其他项目）：

```sh
npx wrangler login --scopes account:read user:read workers:write workers_scripts:write pages:write
npx wrangler pages project create shichen-wellness --production-branch main
npm run deploy:pages
```

已存在 Pages 项目时跳过创建。`pages/wrangler.jsonc` 声明同账号的 Worker Service Binding；在自己的账号复现时先核对 Worker 名称和 Pages 项目名是否可用。Pages 不保存模型密钥；Worker 限流仍生效。

`build:pages` 只复制前端公开产物和很小的 API 网关；`deploy:pages` 在系统临时目录准备隔离部署，避开 Vite 生成的 Worker 配置重定向。临时目录只含公开资产与服务绑定配置，不复制 `.dev.vars`。手机日常入口用 `?mode=daily`；演示入口用 `?mode=demo`。

[Cloudflare Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/) · [Service Bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)

## 流量与费用

当前 `DEMO_RATE_LIMITER` 对三个模型 POST 入口共享配置：每个 Cloudflare 节点约 30 请求／60 秒。缺绑定时返回 503，触发限流时返回 429 和 `Retry-After: 60`。这一计数按入口请求计算，一次工作流可能包含多次模型调用；非法智能体凭据也可能先消耗入口限流计数。

Cloudflare 此类限流按地域节点生效且为近似、最终一致计数，不能作为全球严格请求数或费用封顶。需要严格预算时应采用额外的集中配额机制，并在模型服务侧设置可用的费用限制。此项目没有实现该集中机制。[Cloudflare Rate Limiting 官方说明](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## 部署后验证

1. 打开实际部署地址，确认页面与内容库能加载，普通页面请求不会被静态资源回退吞掉。
2. 读取 `/api/status` 确认配置存在；该结果不能证明模型调用成功。
3. 使用一个已确认的普通场景生成卡片，展开 N04、N05、N06、N08，核对实际查询、固定内容、条件与 `providerMode`。失败回退应如实显示。
4. 读取 `/api/agent/openapi.json`。使用独立访问密钥调用 `/api/agent/card`，确认卡片、出处、`mode:preview`、`counted:false` 和 `persisted:false`；不要在截图或日志中公开 Authorization。
5. 在手机打开实际 HTTPS 地址，检查布局。定位须经用户操作与浏览器许可；拒绝定位后仍可手选城市。没有后台锁屏推送。

常见问题：模型密钥缺失会显示 `offline`；接口超时或输出不合格可能为 `fallback`／`mixed`；模型 POST 返回 503 时也要检查限流绑定；429 应等待后重试。Node 测试会出现 `stripTypeScriptTypes` 的实验特性提示，这是测试直接执行 Worker 源码产生的提示，不代表云端模型已运行。
