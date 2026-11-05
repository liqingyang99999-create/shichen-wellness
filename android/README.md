# 时辰心管家 Android 1.0.0

工程继承0.9最新原生实现，联网加载 https://shichen-wellness.pages.dev/?mode=personal，网页不打包进APK；生产网页必须同步发布。只有该HTTPS来源的主框架获得原生桥接。

包名 cn.shichen.wellness.preview，versionCode 10，versionName 1.0.0，Android9/API28以上。release构建关闭debuggable；沿用已安装0.9的证书以支持覆盖安装。这是旧预览证书的连续升级，不是应用商店签名迁移。源工程不包含私钥或密钥值。

## 后台调度

- SharedPreferences只保存通用ID、类别、时点和回执，不保存药名、主诉、测量值。AlarmManager通过不可变PendingIntent唤起非导出receiver，不依赖WebView计时器或常驻前台服务。
- 有授权使用setExactAndAllowWhileIdle，无授权使用setAndAllowWhileIdle。精确提醒授权与通知权限分开；后者API33以上按需请求。没有承诺通知永不延迟。
- 每次receiver投递后续排次日，无7天失效窗口。开机完成、校时、时区变化、覆盖安装、精确授权变更、返回应用时恢复。时点统一Asia/Shanghai，与网页北京时间一致。
- 相同配置重复同步保留token和deadline，修复旧版返回应用把已到点但尚未送达的提醒跳到明天的问题。延迟不超过2小时的日程最多投递一次，过期、已投递、取消的广播不补发。
- 23:00–05:00不发普通提醒；夜间自设用药提醒需明确选择并静音，不改用药时间。不监测后台健康和睡眠。
- 一分钟后测试由用户点按登记独立系统闹钟，按主页键后查看通知栏。权限/对应频道未开时不伪称登记成功；重复测试替换上一项。系统弹性提醒可能晚于一分钟。
- 强制停止、关机、关闭安卓容器会中断提醒，重新打开后恢复。省电、勿扰、厂商管理及卓易通宿主通知转发仍由系统控制。

## 桥接契约

原有语音、定位、前台步数、用量统计、图片保存/分享、showNotification、syncReminders、cancelReminders保持兼容。

getNotificationStatus新增并保留：
- permission: granted/prompt/denied；enabled；canNotify（至少一个频道可显示）；channels:{card,medicine,silent}，界面应逐频道核对。
- backgroundSupported；batteryOptimizationIgnored；batterySaver；backgroundRestricted。
- exact；scheduleMode: exact/inexact；exactPermission: granted/denied/not_required。
- scheduled：两模式合计的日程时点数，不含一次性测试；nextAt、lastScheduledAt：epoch毫秒，无记录null。
- lastDelivery:{at,expectedAt,outcome}；recent最多30条；timezone:Asia/Shanghai。
- 回执仅表示系统通知已提交，不代表用户看到、完成行动或服药。

syncReminders接收{mode,enabled,quietHours:{start:'23:00',end:'05:00'},nightMedicationSilent,reminders:[{id,kind,time,enabled}]}。mode仅personal/competition；kind仅card/medicine；time为HH:mm。最多96项，其中普通18项。返回实际scheduled、skippedNight、exact、scheduleMode、nextAt、permission、canNotify。nextAt是全机两模式最近登记时点。

scheduleTestNotification({mode})返回{scheduled:true,scheduledAt,exact,scheduleMode}；错误通过原bridge错误响应返回。openNotificationSettings、openExactAlarmSettings、openBatterySettings打开对应系统页面并返回opened；API31前精确权限无需请求，opened:false。电池入口是系统优化列表，没有自动请求白名单豁免。

## 构建验证

运行 build-apk.ps1 -JavaHome <JDK17> -SdkRoot <AndroidSDK35> -GradlePath <Gradle8.11.1/bin/gradle.bat>。先运行160项纯Java检查，再离线assembleRelease lintRelease。省略GradlePath可用wrapper联网构建。

产物 app/build/outputs/apk/release/app-release.apk。本机既有签名配置由构建工具使用，不复制到工程或公开资料。版本化标准下载名shichen-wellness-1.0.0.apk，并提供同字节shichen-wellness-1.0.0-preview.apk兼容别名：旧0.9壳只接受后者，新版支持二者。

本机无连接ADB设备、无已配置模拟器，没有进行手机/卓易通后台送达实测。策略测试、构建、签名检查不代表真机成功。

Lint无错误；4项警告已审阅：同步SharedPreferences commit用于先持久化一次性投递标记；两项固定竖屏警告是现有纵向手机界面选择；WebView JavaScript是网页所需，仍受HTTPS来源/主框架白名单约束。

## 官方依据

- [系统闹钟与应用生命周期](https://developer.android.com/develop/background-work/services/alarms)
- [Android14精确闹钟权限默认拒绝](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)
- [通知运行时权限](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
- [Doze和App Standby限制](https://developer.android.com/training/monitoring-device-state/doze-standby)
