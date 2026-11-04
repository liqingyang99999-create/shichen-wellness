# 时辰心管家安卓预览版

这是一个可侧载的安卓 APK：原生外壳打开 Cloudflare 上的手机界面，并按用户操作申请设备权限。界面与卡片由 `https://shichen-wellness.pages.dev/?mode=app` 提供；AI 密钥只保存在服务器。首次启动需要联网。

## 安装与使用

1. 下载交付的 `shichen-wellness-0.4.0-preview.apk`。与 0.3 使用相同签名，可覆盖安装保留应用数据。
2. 在普通安卓手机上打开安装包；系统询问时，只为本次下载所用应用允许安装来源。在卓易通内使用时，按卓易通实际提供的 APK 导入或安装入口操作。
3. 打开「时辰心管家」，先尝试聊天生成卡片。
4. 打开设置，按需申请定位、运动识别或使用情况访问权限。拒绝权限后仍可使用聊天；城市可手填。
5. 从系统授权页返回后状态会重新读取，也可点击「刷新设备状态」。权限、传感器是否存在、是否收到读数分别展示；只授权不代表已经取得数据。

这是预览签名安装包，不是应用市场发行包。Android 最低版本为 9 / API 28。应用固定竖屏，不依赖 Google Play 服务。卓易通是否允许安装、其 WebView 版本、宿主鸿蒙权限映射，需要在目标手机实测；此 APK 不等于原生鸿蒙 HAP。

## 权限与数据的准确含义

| 能力 | 使用方式 | 边界 |
| --- | --- | --- |
| 网络 | 打开网页、调用同域 AI 接口 | 无网络时显示重试入口；不含离线 AI |
| 定位 | 用户点定位按钮后，系统询问前台粗略/精确定位 | 不申请后台定位；不自动知道坐姿、是否有扶手 |
| 屏幕数据 | 用户在系统「使用情况访问」中授权 | 午夜状态完整才显示今日总量；否则明确显示已记录区间及其亮屏时长。不是连续看屏时长，也不假设为鸿蒙全机数据 |
| 步数 | 用户授予运动识别，且当前安卓环境提供步数计数器或步数检测器 | 累计本次打开的前台监测段；不计后台间隔，不是全天步数，不从加速度虚构步数 |
| 语音输入 | 用户点击后打开系统语音识别界面，中文自由表达 | 本应用不申请录音权限、不后台录音；系统识别服务可能联网，离线偏好不保证离线。文字仅填入输入框，由用户编辑并主动发送 |
| 华为健康、睡眠 | 未接入 | 不用模拟值代替，也不从步数推算运动分钟或睡眠 |

原生桥只向界面返回汇总量和可用性，不返回逐应用使用记录。当前版本在设置中展示屏幕/步数指标，不把这些不同语义的指标强行写入推荐引擎的「连续看屏分钟」「近期活动分钟」。用户可以通过聊天说明这些情境。

亮屏统计在后台线程读取并缓存最多 5 秒，不阻塞界面；从系统设置返回时立即使缓存失效。查询只覆盖当前开机后的记录，使用单调时钟确定开机边界，因此 Android 9 也能返回实际存在的亮屏事件。午夜状态缺失或今天发生重启时，只返回可确定的记录区间；未闭合的重启前区间不计入。区间跨度可能包含数据缺口，`coveredMinutes` 才是可确定状态的累计覆盖时长。没有任何亮屏事件时返回 `no_events`，不填 0。

步数优先使用系统 `TYPE_STEP_COUNTER`，若不存在或无法注册则尝试 `TYPE_STEP_DETECTOR`。只有注册成功且接收到真实读数后才给出计数；计数器第一条仅建立基线，检测器第一条即代表一步。回到前台后重新建立计数器基线，保留此前已采集段的合计，不把后台间隔带入。传感器可能延迟上报，设置页显示最后读数时间。支持声明或权限成功仍不能证明卓易通已转发宿主传感器数据。

华为健康仍是 `not_integrated`：当前 APK 尚未配置华为健康服务接入，系统运动权限不会自动接通它。不会读取其他应用的私有数据库，也不会把原生计步称为华为健康数据。

本版不申请通知权限，也没有后台定时推送服务；前台通过聊天或换卡推荐。后续后台提醒需要单独实现通知渠道、调度和用户开关。

## 构建

依赖：JDK 17、Android SDK Platform 35、Build Tools 35.0.0、Gradle 8.11.1。AndroidX WebKit 固定为 1.12.1，Android Gradle Plugin 固定为 8.9.2。

Windows：

```powershell
./build-apk.ps1 -JavaHome 'C:/path/to/jdk-17' -SdkRoot 'C:/path/to/android-sdk'
```

脚本先执行 21 项亮屏区间检查、15 项步数会话检查和 22 项原生操作边界检查，再执行 `assembleDebug lintDebug`，生成 `app/build/outputs/apk/debug/app-debug.apk`。`debug` 构建的包名为 `cn.shichen.wellness.preview`，系统生成的本机调试签名不提交到 Git。正式长期分发前应切换独立保管的发行签名，并保留同一签名供后续升级。

## 桥接口

网页通过 `src/native-bridge.ts` 调用 `nativeRequest(method)`，原生仅接受 `getCapabilities`、`requestLocation`、`requestActivity`、`openUsageSettings`、`openAppSettings`、`startSpeechRecognition`。

桥采用 AndroidX 的来源白名单消息监听，仅 `https://shichen-wellness.pages.dev` 的主框架可调用；外部 HTTPS 链接交给系统浏览器。禁用明文 HTTP、本地文件访问和内容 URI 访问，不绕过 TLS 错误。旧 WebView 不支持安全消息桥时，不回退到无来源限制的 `addJavascriptInterface`。

0.4 保留 0.3 的指标字段，并增加安装包版本码与系统语音能力。所有时间戳是 Unix 毫秒；分钟和步数是明确标注的汇总量，不包含应用名称、地址或逐条健康记录。

| 字段 | 语义 |
| --- | --- |
| `appVersion` / `versionCode` / `apiLevel` | `0.4.0-preview`、整数 `4` 和当前安卓运行环境 API 级别；网页可按版本码判断是否有新安装包 |
| `speech.available` / `status` | 系统是否能解析语音识别 Activity；状态为 `available` 或 `unsupported`。可发现服务不代表真机识别已成功 |
| `speech.source` / `language` / `preferOffline` / `offlineGuaranteed` | 固定为 `system-recognition-activity` / `zh-CN` / `true` / `false`；服务可自行决定是否联网 |
| `usage.status` / `reason` | `available`、`partial`、`no_events`、`permission_required` 或 `error`，及对应机器可读原因 |
| `usage.screenMinutesToday` | 仅完整今日覆盖时有数值；部分记录时为 `null` |
| `usage.observedMinutes` / `windowStart` / `windowEnd` / `coveredMinutes` | 已采集区间的亮屏分钟、首尾边界、实际覆盖分钟；不完整记录不冒充全天 |
| `steps.status` / `reason` | 已读取、等待首条、未授权、无传感器、注册失败或前台监测暂停 |
| `steps.counterAvailable` / `detectorAvailable` / `listenerRegistered` | 当前环境的传感器发现与注册结果；不推断宿主能力 |
| `steps.sessionSteps` / `source` / `lastSensorAt` / `observedFrom` / `eventsCount` | 实际接收的前台步数、来源、首末读数时间及有效事件数 |
| `health.status` | 当前固定为 `not_integrated`，表示应用尚未接入华为健康服务 |

原生 `onResume` 会向可信网页发送 `shichen-native-resume` 窗口事件，网页可重新查询状态；桥不向页面提供任何新的权限绕过方法。

### 语音结果与生命周期

`startSpeechRecognition` 使用 `RecognizerIntent.ACTION_RECOGNIZE_SPEECH`，`LANGUAGE_MODEL_FREE_FORM`、中文和最多一条候选结果。成功返回 `{ text: "识别文字" }`（最多 1200 个 UTF-16 字符，不切断末尾代理对），取消返回 `{ cancelled: true }`。未提供系统服务、无法启动或没有文字时返回 `ok:false` 与可显示的中文错误；无服务时提示使用输入法麦克风。没有音频数据通过桥传回网页。

一个语音任务与系统权限弹窗互斥。语音 Activity 导致的正常前后台切换不会丢失结果；页面跳转、重新加载或 Activity 销毁会使旧回调失效。发送任何桥结果前同时检查当前可信来源与文档代次。用户可在系统界面取消；网页应给予语音请求足够的等待时间，不因取消而自动发送输入框内容。

### 更新安装包下载

WebView 仅把精确来源 `https://shichen-wellness.pages.dev` 下 `/download/shichen-wellness-数字.数字.数字-preview.apk` 的下载交给系统浏览器（允许标准 443 端口，不允许查询串、片段、用户信息或编码路径）。普通来源详情链接仍按原有规则由用户点击后在外部浏览器打开。应用不静默下载、不申请安装权限，也不自动安装；下载后由用户按系统或卓易通流程确认安装。新 APK 必须保持包名和签名一致。

## 验证范围

交付时记录 APK 构建、Android Lint 和签名检查结果。未连接真机时，不把静态检查或网页测试称为安卓权限验收。目标手机需要验证：覆盖安装与启动、语音成功/取消/无服务降级、识别后手动发送、下载跳转、拒绝/允许定位、聊天直接出卡、模拟时间、使用情况授权返回、无传感器降级、外部来源跳转与断网重试。

## 官方依据

- [Android WebView 安全消息桥](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge)
- [WebViewCompat 来源白名单](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [UsageStatsManager](https://developer.android.com/reference/android/app/usage/UsageStatsManager)
- [步数传感器与运动识别权限](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion)
- [系统语音识别 Intent 与离线偏好](https://developer.android.com/reference/android/speech/RecognizerIntent)
- [AGP 8.9 的构建兼容版本](https://developer.android.com/build/releases/agp-8-9-0-release-notes)
