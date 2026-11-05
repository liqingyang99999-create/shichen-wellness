# 结构化数据与接口字段

版本：0.12 网页预览。更新：2026-11-05。本目录是内容与问卷定义，不包含用户健康记录或密钥。当前`cards.json`是数组，共198项，其中196项启用、2项禁用；`sources.json`为50项来源数组。本次仅更新网页内容，APK仍保留上一版；安装包存在不代表健康后台已接通。

## cards.json

| 字段 | 类型 | 含义与约束 |
|---|---|---|
| `id` | string | 稳定唯一ID；更新文字不另造重复ID |
| `title` | string | 卡片标题，不承诺治疗效果 |
| `category` | string | 展示类目；同时参与夜间运动／食养排除 |
| `actionFamily` | string | 动作家族软去重键；卡片ID自身另有严格24小时冷却 |
| `durationSeconds` | number | 当前为30，表示起步／准备时间，不是整套动作或烹饪耗时 |
| `steps` | string[] | 2—3个可执行短步骤，不能用长引文代替操作 |
| `why` | string | 内容用途与解释，不等同本次决策的`reason` |
| `action` | string | 本次行动摘要，当前取首步；保留`steps`作完整步骤，不能误以为只有一句操作 |
| `reason` | string | 与`why`同义的新内容解释字段；引擎优先采用，不是疾病病因 |
| `safety_note` | string | 与动作直接相关的简短限制或操作提示 |
| `cooldown` | string | 当前所有卡标记`24h`；普通卡至少24小时，weekly仍按七天更严格限制 |
| `scene` | string | 本地景图键：bamboo、flowers、leaves、meadow、night、sky、tea、water |
| `constitutions` | string[] | 适用类型键；`all`表示通用，不代表忽略其他限制 |
| `preferredConstitutions` | string[]，可选 | 筛选后排序用的舒适偏好，不是诊断或治疗处方 |
| `preferenceReason` | string，可选 | 偏好理由，使用条件式说明 |
| `slots` | number[] | 时辰起点：23、1、3、5、7、9、11、13、15、17、19、21；不是0—11索引 |
| `triggers` | string[] | baseline、fatigue、poor_sleep、angry、anxious、sad、after_meal、before_meal、eating；扩展dry_mouth、bitter_taste、loose_stool、yellow_urine、poor_appetite、suppressed_emotion，以及journal、photo、drawing、plants、family、tea、music等明确活动表达 |
| `requiredContexts` | string[]，可选 | 必须同时满足的情境，例如`eating`防止进餐卡脱离实际用餐情境 |
| `incompatibilities` | string[] | 不相容场景／当前主诉，如eating、road_attention、loose_stool、poor_appetite、active_task；与疾病禁忌分别检查 |
| `reviewedSupport` | object，可选 | 原位支持动作适用范围：kind=passive_rest，symptomKeys、duringAssessment、requiredContexts。只在统一分级支持分支使用，不能绕过急症、道路注意、进食、夜间或其他个体禁忌。 |
| `contraindications` | string[] | 已知情况排除键；存在任一命中就不推荐，未知不当已排除 |
| `indoor` | boolean | 是否可在室内执行；寒冷或明显降温时参与筛选 |
| `nightSafe` | boolean | 内容适合夜间清醒时安静执行；不授予唤醒睡眠用户的权限 |
| `requiresGettingUp` | boolean，可选 | 明确是否要求起身；当前标注nightSafe的卡均为false，未知不能推定已具备活动条件 |
| `coldWeatherPreferred` | boolean，可选 | 寒冷环境优先排序标签，不是医学温度阈值 |
| `weatherCondition` | hot / cold，可选 | 必须符合已提供的冷热环境条件，不能在普通天气随意选入 |
| `preferredSeasons` | string[]，可选 | 季节软偏好，使用春／夏／秋／冬，不单独建立治疗结论 |
| `preferredSolarTerms` | string[]，可选 | 节气软偏好，可在其他合适情境使用 |
| `solarTerms` | string[]，可选 | 非空时为节气硬条件，仅匹配所列节气；不可与软偏好混用 |
| `sourceIds` | string[] | 必须引用`sources.json`真实ID；可多来源 |
| `frequency` | normal / weekly | 普通候选或七天低频内容；不直接规定每日推送总次数 |
| `medicalReview` | string | 当前启用卡为`conservative-preview`，表示保守预览状态，不表示医师认证 |
| `enabled` | boolean | 仅明确启用条目进入推荐池 |
| `reviewStatus` | string，可选 | 待审卡`needs-clinician-review`；不因其他标签匹配自动启用 |
| `audio` | object，可选 | 音乐卡含`mode: gong/shang/jue/zhi/yu`及`durationSeconds:30`；不包含外部音频URL或受版权录音 |

疾病键包括`hypertension / coronary / diabetes / obesity / heart_failure`；限制还包括`fluid_restriction / mobility_limited / food_allergy / therapeutic_diet / swallowing_difficulty / acute_symptoms`等。穴位与动作细项限制见[内容依据](../docs/content-evidence.md)。新增卡必须同步合法键、测试与来源，不能仅填一个宽泛`all`就进入所有场景。

`HOLD01 / HOLD02`为禁用药茶审核记录，不提供制作剂量，不参与出卡。全时辰覆盖表示在允许的状态下有候选，不表示驾驶、急症、睡眠或未知条件必须强行出卡。

`ST01—ST24`各带一个具体中文节气的`solarTerms`硬条件。`MU01—MU05`属于“五音舒缓”，采用原创Web Audio音景，`nightSafe:false`。音频只在点击开始后播放，播放器提供音量和停止，不以卡片出现在页面上作为播放授权。

## sources.json

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | string | 被卡片引用的稳定唯一键 |
| `title` | string | 原始题名，保留便于人工核对 |
| `url` | string | 原始公开资料链接，不是搜索结果页 |
| `publisher` | string | 发布机构 |
| `scope` | string | 本项目实际采用的范围及没有采用的外推 |
| `accessed` | YYYY-MM-DD | 本轮访问核对日期 |

来源文章标题可能包含功效描述，卡片只采用`scope`限定的信息；链接可查看不等于其中每个主张都被本产品采纳。

## questionnaires.json

顶层`schemaVersion`为数据结构版本，`verifiedAt`为核对日期。`types`提供九类稳定键、中文名和描述；`options`为1—5的共同回答等级；`simplified`和`standard`分别定义两种问卷。

九类键：`balanced / qi_deficiency / yang_deficiency / yin_deficiency / phlegm_damp / damp_heat / blood_stasis / qi_stagnation / special`。

| 字段 | 含义 |
|---|---|
| `title / method / note` | 展示名、方法与使用边界 |
| `recallPeriod` | 近一年，不以此刻单次异常代替长期体验 |
| `items[].id` | 简测S01—S09；标准框架C01—C27 |
| `items[].text / type` | 简洁题意及主展示类型；标准版实际计分以`scoring`为准 |
| `items[].sourceRefs` | 标准附录原表与行号，例如A.1(2) |
| `items[].help` | 可选作答提示，不要求主动诱发症状 |
| `items[].exclusiveGroup / appliesTo` | C17、C18适用分支；二选一，不把不适用题填成1 |
| `exclusiveGroups` | 分支提示、选择值和说明 |
| `scoring[type][]` | 该类型的计分映射；`itemId`对应题号，`reverse:true`使用6−回答 |
| `scoring[type][].exclusiveGroup` | 用已选择分支代替该一个条目，分母不包含两支 |
| `thresholds` | 仅简测项目频率提示规则，不能套用为标准阈值 |
| `standardId / sourceUrl / sourceSections` | 现行GB/T46939—2025及正式来源 |
| `storedItemCount / answeredItemCount` | 27个不同条目／每人26个适用回答 |
| `validated / validatedAdaptation` | 当前均为false；不声称本软件已验证 |

`scoreConstitution(mode, answers)`返回：

| 字段 | 含义 |
|---|---|
| `scores` | 九类0—100分；标准转化分或简测单项频率，不能混比，不是概率 |
| `primary` | 可能有多个主要相关表现键，允许空数组，不强行指定一类 |
| `label / method / summary` | 给用户的结果、方法与解释 |
| `classifications` | 标准版yes/basic/inclination/no；简测prominent/not_prominent |
| `tendencies` | 标准版倾向类型，避免被基本平和遮蔽 |
| `rawScores / itemCounts` | 标准版原始分和分母，可复核 |
| `answeredCount / selectedBranches` | 实际已答数、标准版选中的适用题 |
| `scoreMeaning / validated` | 分数性质及验证状态 |

漏题、双分支、错题号和非法值抛结构化错误；详细规则见[体质依据](../docs/constitution-evidence.md)。

## 运行时输入：不属于静态卡库

| 对象 | 主要字段 | 来源与限制 |
|---|---|---|
| Profile | name、age、height、weight、conditions、constitution、assessmentMode、assessedAt、fluidRestricted、limitedMobility、allergies | 用户自填、问卷计算；不从姓名推断病史 |
| Vitals | source、measuredAt、quality、heartRate、baselineHeartRate、hrv、baselineHrv、stress、sleepHours、steps、asleep、durationMinutes | source只取simulation/device/unavailable；未知值不填模拟默认值 |
| 睡眠扩展 | sleepStages.deep/light/rem/awake、nightHeartRate | 由设备或明确模拟给出，不从总睡眠时长推算 |
| BloodPressure | id、systolic、diastolic、pulse、measuredAt、isMorning | 用户手动录入；时间与数值校验后追加，晨起标记不覆盖旧记录 |
| Weather | city、temperature、drop24h、description、measuredAt、source、minTemperature | 真实天气或明确simulation，drop24h为前日同时间温度减当前温度；自述冷环境另以文本情境表示，不填伪造数值 |
| Medication | id、name、times、enabled、note | times是HH:mm数组；原样保存医嘱时间，不含系统推断药物类别 |
| Acknowledgement | id、medicationId、scheduledAt、status、at | 针对一次具体用药时间的用户记录；不等于确认实际服药的传感证据 |
| Opportunity | id、scheduledAt、window、cardId | 已到时并形成行动的计划机会，用于依从性分母 |
| Completion | id、opportunityId、cardId、title、completedAt、symptomBefore、symptomAfter | 由已开始的唯一行动会话经本人确认产生；感受可空缺，0—3只为自评；同ID只计一次，护心值按唯一完成数每次+1；无计划关联不增加分母 |
| Symptom record | id、symptoms、severity、recordedAt | 主动输入次数记录；当前severity为固定记录占位，不是评定的严重度，不代表连续监测或完整病史 |
| Recent card | id、shownAt、category、actionFamily，可选slot | ID的最后出现时间；用于严格冷却及跨时辰类别／家族偏好。slot若提供为23、1、3等时辰起点，否则从时间推导 |
| Notice | id、title、body、at、kind、read、medicationId、scheduledAt、card、reason | card为当时卡片快照；历史内容不能覆盖当前急症判断 |
| Reminder attempt | 日期和时刻组成的稳定ID | 记录到点尝试，刷新不得重复询问 |

`decide(input,cards)`返回`level / reason / message / evidence / card`及可选`question / options / source`。`level`为emergency、symptom、confirm、baseline，辅助状态clarify、silent。主诉优先；`evidence`说明数据时间、来源和规则用途，不是模型推测的病因。

### 分级追问与静息复核

| 输入／输出 | 值或字段 | 实际行为 |
|---|---|---|
| 待评估输出 | `level:'clarify'`、`inputKind:'cardiac' / 'dizziness' / 'numbness'`、`assessmentPending:true` | 心慌／胸闷／头晕尚未说清程度与伴随表现，或发麻需要进一步了解；暂不取普通卡 |
| 追问上下文 | `clarificationContext:{topic,text}` | 后续自由回答保留未解除的主诉；前文已存在时不重复拼接 |
| 最新原始答复 | 输入 `latestInput:string`，可选 | 未合并历史的本轮文字单独作红旗扫描；有界上下文仍保留最新部分，不能截去末尾急症 |
| 发麻阶段 | `followUpStage:'onset' / 'distribution' / 'associated'` | 依次问起始方式、侧别、无力／言语／面部变化；明确危险征象直接急救，不等待问完 |
| 静息照护 | `level:'symptom'`、`reason:'gentle_rest_recheck'`、`card:null`、`careSteps:string[]` | 仅完整的轻微、短暂、正在缓解描述及相应危险伴随否认满足规则时显示独立照护卡；不从穴位、运动卡库抽取 |
| 复核输出 | `recheck:{afterSeconds:60,question,options}` | 提供短暂静息后的反馈入口；可以立即反馈，不要求等待计时才求助 |
| 复核输入 | `recheckOutcome:'improved' / 'persistent' / 'worse'` | 改善、仍未缓解、加重分别处理；新危险表达仍先升级 |
| 改善输出 | `reason:'symptoms_improved'`、`assessmentResolved:true`、`card:null` | 记录改善反馈并继续舒适休息，不等同排除疾病或自动完成一次行动 |
| 持续／加重 | `persistent_cardio_recheck` 或 `symptoms_medical_review`等 | 心血管持续不适与头晕按现有规则分级求助；不重复普通养生尝试 |

多个症状保留各自事实，未评估的第二项不能继承第一项的轻微、短暂和缓解。未知、否定、过去或假设不当作已确认的当前症状。明确胸痛、危险呼吸表现、冷汗、晕厥、卒中征象以及已知冠心病的新胸部不适优先急救。规则为未临床验证的预览流程，不表示正式分诊等级。

### 选择方式与解释

`selectionMode:'alternative_method'`与`currentCardId`对应“换一种方式”：先在同类里按稳定ID顺延并允许回首；同类耗尽时仅允许经过审核的、更低负担的安静动作家族，不转为备餐、运动或娱乐。替代命中返回`alternative_lower_burden`；没有新方式且原卡仍符合当前条件时返回`alternative_exhausted`，保留原卡说明，不写新展示记录。原卡已不安全则返回`no_compatible_card`，不能继续保留。

兼容 `selectionMode:'same_category'`，它只选同类，耗尽为`category_exhausted`。不传选择模式时走常规选择。所有模式均遵守禁忌、情境、夜间、24小时与七天限制；不能用换方式解除待评估或急救状态。新近异常数据的“无明显不适”确认只对同一次测量有效。

`feedbackSource`可取`manual / voice / tag`，只对非空用户文本生成来源反馈；只有voice才能写为语音表达，标签和键盘按手动输入呈现。`options`是可选表达捷径，不限制用户自由描述；UI追问始终有可编辑文字、语音转写与手动发送入口。

文本分析可返回`musicModes: [gong|shang|jue|zhi|yu]`。只有明确聆听意愿才进入music情境；指名宫／商／角／徵（征）／羽时按audio.mode过滤，不把“宫”字出现在其他语境中当成播放请求。音乐卡仍须通过白天与当前情境条件，出卡不自动播放。

血压数字或时间需要核对时返回`inputKind: "blood_pressure"`和空`options`，UI打开专用表单；合法历史读数即便为manualMeasurement也不假称刚测。缺失、无效或未来时间不填默认值，不以选择症状代替输入数字。

`cold_weather`是明确自述寒冷的环境情境，`morning_rise`是醒来／准备起床的情境；两者不是症状或实测字段，不创造温度、起床活动能力或夜间心率。主界面标签可以累积，取消一个不清空其余；追问选项只是表达捷径，始终可自由补充。

“护心值”为唯一`Completion.id`的数量，不单独保存可任意累加的健康分值。30秒倒计时结束只打开确认面板，暂停、页面刷新、重复确认或单纯反馈“已缓解”均不伪造完成。没有前后感受时不存`0`作为默认改善。

## 存储与通知契约

个人与竞赛数据分别保存在`shichen-care-preview-v1-personal`和`shichen-care-preview-v1-demo`，外层含`version:1`与`data`。请勿将这些运行时记录打包到公开仓库或静态JSON；浏览器存储也不是加密医疗病历系统。

展示历史另以`shichen-care-preview-v1-personal-card-history`和`shichen-care-preview-v1-demo-card-history`保存，和Store.recentCards合并。按ID取最后一次展示时间、保留八天，不以固定最近80项截断。一般卡滚动24小时、weekly卡七天；恰好到期可放行，日期跨午夜不清零。旧无时间／无效时间记录迁移为当前时间，未来记录保留并保守冷却。直接调用引擎而未经过迁移时，无效或未来时间也不能被用来绕过同ID冷却。

通知数据仅包含`version:1 / mode:personal|competition / noticeId`。Service Worker从这些受限字段构造本站根路径通知入口，精确匹配模式；不读取任意外部URL。没有服务端后台健康调度或远程健康数据接口。健康适配器签名见`src/device-adapter.ts`，授权和真正读取仍需原生平台实现。0.9安装包的权限／计步／屏幕记录状态来自当前运行环境，不能当作华为健康或鸿蒙宿主已经接通。


季节修饰字段：`preferredSeasons`为春／夏／秋／冬排序偏好，`preferredSolarTerms`为24节气名称偏好；`weatherCondition:hot`在当前气温≥30℃且没有明确自述冷环境时启用，`cold`在明确自述冷环境，或当前／今日最低预报≤5℃，或24小时降温≥5℃时启用。它们始终服从症状、禁忌、时段和夜间硬过滤。

## 测试清单

已通过组合回归，包括真实卡库与来源、复合主诉及续答去重、最新红旗保留、待评估／静息复核／持续升级、发麻追问、异常数据确认、晨起与寒冷、24小时／七天冷却、同类顺延与更低负担替代、夜间床上限制、五音音景、体质计分、血压时间、计划分母、唯一完成会话与原生状态契约。最终数量随交付记录列明，不将模拟接口测试写成真机健康后台验收。
