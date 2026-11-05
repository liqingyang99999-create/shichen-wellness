# 1.0 发布与核对

正式页面和预览页面须发布相同dist，均通过Pages服务绑定SHICHEN_API调用同一Worker。客户端允许的源为正式域、care-preview域和本地5186/5187；不能把Origin检查当作账号认证。

1. npm ci；npm test；npm run build。
2. 从同签名release APK生成latest.json，准备正式、旧壳兼容与无版本三个同字节别名。
3. npm run verify:release -- --require-apk；npm run deploy:worker。
4. npm run build:pages；node scripts/deploy-pages.mjs main；node scripts/deploy-pages.mjs care-preview。
5. 检查正式与预览的首页资源哈希、/api/care-ai/status JSON、下载清单、APK哈希、资料链接，再发布GitHub提交与mobile-v1.0.0附件。

Android只从正式HTTPS域加载网页，属于联网WebView壳；它不把网页文件打包成离线应用。提醒由原生系统闹钟保存并每日续排，接收器不依赖网页持续运行；强制停止和关闭安卓宿主容器会影响送达。
