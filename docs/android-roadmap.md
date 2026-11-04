# 手机真实数据接入：Android 与 HarmonyOS 后续计划

**设备真实数据接入尚未实现。当前先交付手机可访问的外部网页；安装包与原生数据适配留作后续。** 网页可使用真实北京时间、用户主动输入的情境，以及经用户操作获取的地点与天气。手机应用使用记录、步数和睡眠记录需要按平台适配与单独授权；将网页添加到主屏幕不会自动获得这些能力。以下 Android 路线与 HarmonyOS 路线分开评估，不将前者的接口和权限直接套用到后者。

## 日常模式的原则

后续日常模式由真实数据与对话共同提供情境，与竞赛模拟面板分开。未授权、无记录、过期或读取失败时保留 `unknown`，不填入演示数值。用户仍可主动描述当下情境，核对识别结果后预览行动卡。模型只理解情境和组织解释；固定动作、条件校验与来源展示沿用当前流程。

下表列出 Android 的拟接入方式；HarmonyOS 的接口与权限见独立分支。

| 数据 | 拟接入方式与权限 | 能说明什么 | 不能直接推断什么 |
|---|---|---|---|
| 当前时间 | 系统时钟；统一时区处理 | 当前北京时间、时辰和日期 | 作息、清醒或睡眠状态 |
| 地点与天气 | 用户选择城市，或主动请求安卓位置权限；再读取天气 | 查询地点的天气及观测时间 | 用户一直在室外，或当前位置始终不变 |
| 应用使用记录 | `UsageStatsManager`；声明 `PACKAGE_USAGE_STATS`，再由用户在系统“使用情况访问权限”设置中授权 | 系统记录的应用使用、前台或交互事件 | 实际眼睛注视、准确“看屏时长”或疲劳程度 |
| 步数 | Health Connect 的 `StepsRecord` 与相应读取权限；需要有应用或设备写入数据 | 指定时间区间内已记录的步数 | 无步数等于久坐；无记录等于零步 |
| 睡眠历史 | Health Connect 的 `SleepSessionRecord` 与相应读取权限；需要数据来源 | 已记录的睡眠区间、可用时的睡眠阶段 | 此刻一定睡着，或已经实时醒来 |

Usage Access 是系统设置中的特殊授权，不能只靠清单声明。UsageStats 提供的是设备使用历史和统计；将其转换为应用内情境需要明确口径。未来保留独立的“设备使用记录”字段，不未经说明地当作人工确认的 `screenMinutes`。记录缺失、系统锁定等情况必须有单独状态。[UsageStatsManager 官方参考](https://developer.android.com/reference/android/app/usage/UsageStatsManager)

## Health Connect 适用条件

官方要求为 **Android 9／API 28 及以上，并安装 Google Play 服务**。Android 14 及以上通过系统模块提供；Android 13 及以下通过独立应用提供。工作资料不支持。SDK 可编译支持的最低版本与设备实际可用条件不能混用。[官方可用性说明](https://developer.android.com/health-and-fitness/health-connect/availability)

安卓端先调用 `HealthConnectClient.getSdkStatus`，分别处理不可用、需安装或更新提供程序、可用三种情况，再请求数据类型对应的权限。可用且获授权也可能没有任何记录。若设备缺少 Google Play 环境、厂商健康应用不写入 Health Connect，或穿戴设备没有兼容数据来源，需按手机与穿戴型号核验厂商 SDK、地区与开发者资格；当前不承诺可直接接入。[HealthConnectClient 官方参考](https://developer.android.com/reference/kotlin/androidx/health/connect/client/HealthConnectClient)

步数和睡眠是带时间区间的记录。来源写入和同步可能滞后，不能承诺统一的实时刷新延迟。后台读取、读取较早历史分别有额外能力与权限条件，普通读取授权不自动包含它们。发布应用还需按实际使用的数据类型完成相应声明。[Health Connect 数据类型及权限](https://developer.android.com/health-and-fitness/health-connect/data-types)

## HarmonyOS 与华为运动健康分支

后续目标兼容方向包含 HarmonyOS 原生系统与华为运动健康。**Health Connect 和 Android `UsageStatsManager` 不能直接视为该平台的可用接口。** 需按最终应用形态、系统 API 版本和数据类型，核验原生 Health Service Kit、开发者资格、服务申请及真机能力；当前没有完成接入或兼容验收。华为服务入口列出 HarmonyOS 支持，但平台名称本身不保证某类数据在任意应用形态中都可读取。[华为 Health Service Kit](https://developer.huawei.com/consumer/cn/hms/huaweihealth/)

官方“管理用户授权”文档说明：应用实际可操作的数据范围，是**用户授权与运动健康服务审批通过权限的交集**。仅获得用户同意，或仅在工程中声明权限，都不等于取得全部健康数据。该链接属于元服务文档；后续原生应用应继续核对其对应开发指南，不直接照搬示例。步数、睡眠具体开放范围、来源同步、历史访问与后台限制仍需逐项验证。[官方用户授权说明](https://developer.huawei.com/consumer/cn/doc/doccenter-atomic-service/health-add-permissions-as)

跨应用使用时长和屏幕交互统计另行核验鸿蒙当前向普通第三方应用开放的 API、权限等级与审核条件，不能因 Android 存在 Usage Access 就承诺鸿蒙可取得同类数据。未确认开放前，使用用户自述或本应用内交互记录；它们不冒充系统全局统计。睡眠历史不作为实时睡着的证明，无记录仍为未知，沿用下述来源与时间协议。

另一条待验证路线是通过卓易通运行 Android APK。官方说明提供应用下载安装及权限管理，也明确具体应用能否安装以实际情况为准；这些说明不能证明自制 APK、使用情况特殊权限或计步传感器在目标设备必然可用。即使后续能读取容器内使用记录，也不称为鸿蒙全局记录，不默认能够跨容器读取华为运动健康。**当前未制作或交付 APK，也未完成卓易通真机测试。** [卓易通官方常见问题](https://droitong.com/CommonQues.html)

## 数据协议与状态

以下是待实现的适配层协议，不是当前智能体 API 已支持的新增参数：

```json
{
  "metric": "steps",
  "value": null,
  "unit": "count",
  "permission": "notRequested",
  "status": "unknown",
  "source": { "kind": "healthConnect", "provider": null },
  "observedAt": null,
  "intervalStart": null,
  "intervalEnd": null,
  "fetchedAt": null
}
```

- `permission` 独立记录未请求、已允许、拒绝、撤销或不可用；`status` 独立记录可用、无数据、过期、未知或错误。授权成功不等于有数据。
- `source` 区分系统记录、健康数据来源和用户自述；不携带设备序列号或账户标识。
- `observedAt` 是测量或事件发生时间；区间数据同时保留起止时间。`fetchedAt` 只说明何时读取，不能刷新一条旧记录的有效期。
- 新鲜度按数据类型与实际设备同步情况设定并校准，不能让所有数据共用一个“实时”标记。零值与缺失值分开。
- 睡眠历史与当前 `awake / asleep / unknown` 分开保存。用户当前主动对话可作为当次交互的清醒信号，但不改写穿戴睡眠记录；历史睡眠结束时间不直接证明当前清醒。
- 设备步数不直接转换为 `sedentaryMinutes`。新适配字段需同步调整和验证后端白名单，不能直接塞进当前封闭的智能体 API。

## 后续实施顺序

1. 用户确认手机、系统版本和数据来源；开发端记录可用能力，不预设所有安卓机一致。
2. 用户选择“日常模式”；系统创建独立真实情境，初始未知，不继承模拟场景、计数和结果。
3. 用户按需开启使用记录或健康数据；系统先检查能力，再逐项申请所需权限，允许跳过。联网不统一描述为“会弹出系统权限框”。
4. 平台适配端读取有限时间区间内的记录，保留来源、时间与权限状态；无数据直接展示原因。
5. 用户核对自动摘要并补充当下情境；来源冲突时保留双方记录并请求确认，不让模型擅自覆盖。
6. 将确认后的可用情境交给现有筛选与预览流程；轨迹说明哪些来自设备、哪些来自自述、哪些未知。
7. 权限撤销、记录过期或来源不可用时清除相应当前推断，恢复未知；后续按实际授权重新读取。

实施验收至少覆盖：无 Google Play／提供程序、拒绝与撤销权限、获授权但无记录、零步与缺失记录、跨日区间、延迟到达的睡眠记录、用户自述与设备记录冲突。后台提醒、锁屏通知和后台采集另行评估系统限制；本计划不代表这些能力已经完成。
