# 智能体调用接口

本接口让外部智能体只读预览一张日常行动卡，复用网页的固定内容库、检索、条件过滤和解释校验。它不创建提醒，不修改网页提醒次数，不保存调用方会话；可能调用服务端配置的模型并产生费用。不作诊断、处方或疗效判断。

## 接口与服务器配置

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/agent/openapi.json` | 公开发现 OpenAPI 3.1.1、请求结构和函数工具描述；无需密钥 |
| `POST /api/agent/card` | 携带 Bearer 密钥，按明确情境预览卡片 |

服务器须单独配置 `AGENT_API_KEY`。使用随机生成的访问密钥，通过本机 `.dev.vars` 或部署平台的服务器 Secret 设置；不要复用 `LLM_API_KEY`，不要提交到公开仓库或放入网页。未配置时 POST 返回 `503 agent_api_not_configured`。模型仍使用现有 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY` 等服务器配置，调用方不能覆盖。

此模块同时适用 Node 和 Cloudflare Worker，通过已有 `handleApi` 接入。线上域名与 Secret 配置由部署环节完成；代码完成不表示已完成线上联调。此 Bearer 鉴权仅针对 `/api/agent/card`，不改变原网页其他接口。公开部署时，访问控制与请求速率限制应覆盖整站实际使用的模型接口。

## 请求示例

```http
POST /api/agent/card HTTP/1.1
Authorization: Bearer <独立智能体访问密钥>
User-Agent: ShichenWellnessAgentClient/1.0
Content-Type: application/json
```

```json
{
  "snapshot": {
    "intent": "quiet",
    "mealPhase": "after",
    "atMeal": false
  }
}
```

这个示例表示调用方已经确认“餐后，希望安静休息”。省略 `now` 时使用服务器当前真实北京时间，未知的坐姿、空间、闭目或看远条件保持未知；不会因为餐后就猜成午时、已坐稳或可闭眼。只有明确的用户情境才能填入请求。也可传 `{"snapshot":{}}` 预览一般行动卡。

需要演示静态时间时，在 `snapshot` 中加入 `"now":"2026-11-04T12:03:00+08:00"`。日期必须真实有效且包含秒与时区；也支持 `Z` 并转换到北京时间。当前仅支持 `Asia/Shanghai`，节气内容使用库内的 2026 年日期表。

允许字段如下；完整定义以 OpenAPI 为准。

| 字段 | 允许值 |
| --- | --- |
| `now`、`sleepObservedAt`、`sleepValidUntil` | 带时区的 ISO 日期时间；可省略 |
| `timezone` | 仅 `Asia/Shanghai` |
| `intent` | `general`、`eye`、`move`、`quiet`；缺省 `general` |
| `sleepState` | `unknown`、`awake`、`asleep`；缺省 `unknown` |
| `mealPhase` | `before`、`during`、`after`；不推断钟点 |
| `screenMinutes`、`sedentaryMinutes`、`activityMinutes` | 0–1440 内有限数字；未知时省略 |
| `canLeaveSeat`、`canLookFar`、`canCloseEyes`、`sitting`、`spaceEnough`、`hasSupport`、`waterAvailable`、`headphones`、`atMeal`、`goingOut` | 明确确认的布尔值；未知时省略，不能填 `null` 或字符串 |
| `weather` | `{observedAt,rain}`，可增加 `tempC`（−100–100）及 `wind`（0–150 m/s）；来自调用方，不自动联网查询 |
| `previewSolar` | `true` 时，日期表内的节气当天优先预览固定节气卡；不写首见记录，否则普通预览 |

`mealPhase` 与 `atMeal` 同时提供时必须一致：只有 `during` 对应 `atMeal:true`。未来或过期的天气不自动视为新鲜。明确的清醒状态仍受观察时间有效期约束；主动预览并不证明用户当前清醒，也不执行后台提醒。

请求体上限 **16 KiB（UTF-8 字节）**。只接受顶层 `snapshot`；拒绝 `state`、`mode`、`env`、`catalog`、后台地址、密钥、姓名地址和经纬度等未列字段。也不接受 URL 查询参数。错误响应不回显提交值。

## 返回与模型状态

返回包含 `card`（固定步骤、时长、时辰、经络与来源 ID）、`explanation`、`sources`（标题、原文片段和链接）、`decision` 及 11 节点的 `trace` 摘要。没有候选时 `card:null`，查看 `decision.reason`；这仍是已完成的预览判定。

响应固定标记 `mode:"preview"`、`readOnly:true`、`persisted:false`、`counted:false`。每次从新空会话运行，不返回状态对象，也没有跨请求最近卡去重保证；重复调用可能选到同一张。节气预览不会写入首次展示标记。

| `providerMode` | 含义 |
| --- | --- |
| `live` | 本次实际执行的模型节点均成功且输出通过校验 |
| `mixed` | 部分模型节点成功，部分回退 |
| `fallback` | 尝试接口后因网络、JSON 或校验等原因回退 |
| `offline` | 模型未配置，使用规则和模板；本地检索仍真实执行 |

该接口直接接收结构化快照，N02 对话提取会跳过；N04 组织查询与 N08 解释按服务器配置运行。摘要只含节点状态、耗时、检索和候选数量及来源 ID，不含原始快照、模型原文、个人地点或服务器配置。程序不保存调用方状态，但托管平台和模型供应商可能有各自的请求日志策略。

常见状态码：`400` 输入无效、`401` 密钥缺失或错误、`405` 方法错误、`413` 请求过大、`415` 非 JSON、`500` 预览未完成、`503` 服务端未配置智能体密钥。`200` 的模型状态仍须查看 `providerMode`，不能只凭 HTTP 成功声称模型运行成功。

## 接入函数调用智能体

读取发现文档中的 `x-agent-tool` 可取得函数描述及 JSON Schema；函数名为 `preview_shichen_wellness_card`。`x-agent-tool-annotations.readOnlyHint` 标注只读性质，平台不识别扩展字段时，应在其工具注册配置中等价声明。

工具调用适配器需执行以下过程：把智能体参数作为请求体发送到固定服务器的 `/api/agent/card`，由适配器在服务器环境注入 Bearer 密钥，再将响应交回智能体。密钥不放进工具参数、提示词或模型可见内容。未知条件省略；返回步骤和出处按原文展示，不加工成诊断或功效承诺。

Node.js 示例为 `examples/agent-client.mjs`。在调用方项目以私密环境文件保存 `AGENT_BASE_URL` 与 `AGENT_API_KEY`，加入本地忽略规则，随后运行：

```powershell
node --env-file=.agent-client.env examples/agent-client.mjs request.json
```

`request.json` 内容即上面的完整 JSON 请求。省略文件参数则发送空快照；示例仅从调用方环境读取密钥，不读取服务端 `.dev.vars`，不打印密钥。线上使用 HTTPS；本机可用 `http://127.0.0.1:5174`。不要将示例文件中的占位符当作有效凭据。

## 验证

```powershell
node --test test/agent-api.test.mjs test/engine.test.mjs test/context.test.mjs
```

模块联跑 **43/43** 项通过，含 **11** 项 API 测试：未配置／缺失／错误密钥、日期与当前北京时间、请求字节限制、字段白名单、非法数值、固定动作与来源、独立预览及节气不记次数、模型状态与响应脱敏。上述自动化模型响应使用内存模拟。

2026-11-04 另完成一次公网真实模型验证：行动卡接口返回 HTTP 200、`providerMode:live`，N04 查询与 N08 解释均成功。这是单次联调记录，不能保证后续每次模型调用成功。对 `workers.dev` 调用应发送标识自己应用的真实 `User-Agent`；默认库客户端可能被平台检查拒绝，不需要伪装成浏览器或修改安全规则。[Cloudflare 官方说明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)

接口描述遵循 [OpenAPI 3.1.1 官方规范](https://spec.openapis.org/oas/v3.1.1.html)。
