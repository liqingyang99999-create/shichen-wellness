# 内容库与依据说明

更新：2026-11-05。对应 `data/cards.json` 与 `data/sources.json`。

本库包含 **192 张启用基础卡、2 张禁用待审记录、48 条来源**。这是可审阅的保守预览内容，不表示已经完成医师逐卡签署或临床验证。`medicalReview: "conservative-preview"` 是版本状态，不是医学认证。

## 内容与操作范围

- 穴位轻触：7 张。
- 坐姿八段锦：8 张。
- 舒展身体：6 张。
- 自然呼吸：4 张。
- 日常食养：29 张。
- 起居生活：3 张。
- 起居睡眠：8 张。
- 四季生活：7 张。
- 情绪调适：16 张。
- 家人联系：10 张。
- 健康小知识：13 张。
- 急救预演：6 张。
- 日常不适照护：20 张。
- 生活兴趣：14 张。
- 床上安静：12 张。
- 节气专属：24 张。
- 五音舒缓：5 张。

每张启用卡都有 2—3 个短步骤、来源、适用时辰、情境和排除条件。`durationSeconds: 30` 表示本次轻量行动或准备的预计时间；八段锦、备餐、整理用药信息等复杂活动只做起步，绝不表示30秒完成整套功法、煮完食物或填完医疗资料。不需要用力完成或为了计时赶速度。

卡片写法分清三个层次：出处支持的原则或位置；项目为手机交互改写的短动作；本次推荐的情境解释。生活整理、配餐清单、联系亲友等细节属于原创交互设计，引用的健康资料只支持相应生活方式背景，并不证明这些30秒动作本身有临床疗效。页面上的自然景物只作环境氛围，不作穴位定位或人体示范；沿用 bamboo、flowers、leaves、meadow、night、sky、tea、water 八种本地景图。

## 七个穴位怎样使用

内关、劳宫、神门、太阳、合谷、印堂、足三里均核对了官方机构或医院公开的定位说明。卡片只采用指腹轻触或很轻的揉动，不采用针刺、艾灸、刮痧、掐压、加热、强刺激，不要求酸胀、麻木或疼痛。

这些卡只进入日常候选池，不以头晕、心悸、胸闷为触发词。共同排除急性症状、对应皮肤破损、感觉减退和出血风险。合谷另排除孕期；足三里为本预览额外保守排除糖尿病、糖尿病足、心衰、下肢肿胀及无法舒适触及等情况。无法明确位置就跳过，不能靠不断加压“找穴”。

来源文章可能含治疗功效、针灸或防疫内容，本库只取明确标注的定位与注意事项，没有把整篇文章的主张搬入产品。尤其不把内关、神门与“急性胸部不适可先按摩”关联。

## 八段锦的八张卡为何是“起步”

八式传统组织来自国家体育总局定式资料，坐式、减幅和自然呼吸原则参考总局面向慢病老年人的指导。具体小步骤为项目保守改编，尚未获得康复专业人员逐项动作审定。

- 托天、开弓、单举只保留低幅度上肢准备，不强举过顶、不拉满。
- 往后瞧只小幅转头，不强行看背后；有颈部不适排除。
- 摇头摆尾改为头颈正中的坐姿重心准备，未进入原式摇摆。
- 两手攀足只让手掌沿大腿小幅移动，不弯腰够脚。
- 攒拳怒目只做松握收放，不用力握拳、瞪眼或屏气。
- 背后七颠只做坐姿轻抬脚跟，不站起颠震；排除糖尿病足等条件。

八式卡必须经过症状和行动限制筛选；出现头晕、心悸、胸闷等当前不适时不提供。传统名称中的“理三焦”“去心火”“百病消”等不作为产品疗效承诺。没有套用旧版进阶功法资料中的闭气、逆腹式或用力发劲要求。

## 食养、茶饮与慢病限制

启用食养卡使用普通蔬菜、水果、谷物和家常食物搭配，多数要求“选一种”“记在下一餐清单”，不提供药方或治疗剂量。时令表示本地当季供应，不规定某种食材必须在某个时辰食用，也不声称按体质能降压、降糖、利尿或改善心功能。

普通食材选择卡对已知食物过敏、吞咽困难、个体治疗性饮食等设排除。FD17用于回看自己已有的医疗饮食安排，不给出新的盐量、水量或碳水目标。没有默认饮茶、喝汤或额外大杯饮水卡；心衰/限液相关提示只要求遵循个人医疗计划，不能把所有心衰统一当成同一个限液处方。糖尿病足没有泡脚、热敷或按摩推荐。

`HOLD01`（玉米须代茶饮）和 `HOLD02`（复方药茶）是禁用审核记录：
- `enabled: false`
- `reviewStatus: "needs-clinician-review"`
- 无制作剂量、无自动推荐资格，也不宣称利尿、降压效果。
- NCCIH/AHA 的资料仅支持“可能有相互作用、需要核对”，不证明某个复方已经安全有效。

## 体质标签与具体偏好

`constitutions: ["all"]` 表示通用内容的可用范围。为了让个人自述确实改变排序，部分卡另外提供 `preferredConstitutions` 与 `preferenceReason`。这是可撤销的舒适偏好，不是疾病判定或辨证治疗：

| 自述倾向对应键 | 优先内容 | 解释边界 |
| --- | --- | --- |
| balanced | 普通食材多样搭配 | 保持常规生活安排，不暗示“无病”。 |
| qi_deficiency / phlegm_damp | 有支撑的坐姿、短休息 | 对应自述易累或身体沉重，不解释其病因。 |
| yang_deficiency | 可穿脱衣物、移开直吹、室内位置 | 按当前体感调整，不要求捂汗或热敷。 |
| yin_deficiency | 环境舒适度、避直接吹风 | 对应自述干燥感，不直接开出补水或药茶处方。 |
| qi_stagnation | 感受命名、短记录、具体求助 | 对应自述容易紧张，不把情绪归因于已确诊体质。 |
| special | 核对产品、药物与过敏信息 | 不推荐未知成分的药茶、香囊或补充剂。 |
| damp_heat / blood_stasis | 仍使用通用池 | 单凭油光、唇色等自述不足以推出治疗性食材或活血操作。 |

`preferenceReason` 使用“若你自述……”的条件式表达。简化问卷每类一个代表性表现；不能把该字段显示为“你已被诊断为某体质”。疾病、急性症状、行动限制、夜间安静和情境过滤先执行，偏好不能越过这些限制。未提供或无法确定体质时正常使用通用池。

SE02、SE04、SE07 及寒露、立冬、小寒专属卡带 `coldWeatherPreferred: true`，供低温/明显降温环境优先选择。该标签不是温度诊断。其他天气卡的步骤保留条件句，不假设用户所在室内一定冷或热。

## 情境与时辰契约

- `slots` 为时辰起点整数：23、1、3、5、7、9、11、13、15、17、19、21。跨午夜的子时由引擎归一化，内容不自行计算时区。
- `triggers` 使用 baseline、fatigue、poor_sleep、angry、anxious、sad、after_meal、eating、before_meal 等确定键。急性症状不作为安慰型动作的推荐入口。
- 每个时辰有通用安静卡；疲劳和饭后也有多张非运动的安静候选。正在进餐使用 FD16、ML01、ML02 等进餐支持，不要求边吃边闭眼、运动、按摩或做呼吸训练。这三张兼容 sad、angry、anxious、fatigue、poor_sleep 交叉标签，并带 requiredContexts: ["eating"] 硬条件；只有实际正在进餐才可选，不会因单独“难过”就收到用餐步骤。
- `nightSafe: true` 的 26 张卡只保留已在床上无需起身或额外道具的小动作、自然呼吸和安静注意练习，并带 `requiresGettingUp: false`。12 张 NT 卡限定晚间起点21、23、1、3、5；它们不安排喝水、通话、做饭、书写或音乐设备播放。旧版餐中、环境整理等内容改为 false。该标记仍不允许在睡眠、驾驶、勿扰或未知状态下主动推送。
- 所有记录新增 `cooldown: "24h"`；引擎按同一卡片 ID 至少24小时去重，不能换标题绕过。`frequency: "weekly"` 的原有低频内容继续使用更严格周期；不额外增加提醒额度。
- `contraindications` 采用已知疾病/条件键，未填不等于已排除。数据不足时应用不能宣称已经筛尽所有风险。

条件键除已指定的 hypertension、coronary、diabetes、obesity、heart_failure 外，使用 acute_symptoms、dizzy、palpitations、chest_tightness、exercise_restricted、injury、mobility_limited、skin_injury、reduced_sensation、bleeding_risk、pregnancy、eye_surgery、diabetic_foot、foot_injury、leg_swelling、hand_pain、shoulder_pain、neck_pain、spine_condition、hip_pain、knee_pain、therapeutic_diet、food_allergy、swallowing_difficulty、fluid_restriction、medication_interaction_unknown。最后两类药物审核字段主要用于禁用待审记录；默认不会产生药茶推荐。

## 急性求助与平时预演分开

ER01—ER06 只做**没有急症时的平时预演**，频率为 weekly。认识120入口不实际拨打测试电话；地址、紧急联系人和用药资料由用户自己保管。

实际胸痛、冠心病伴新发胸闷，或胸部不适伴呼吸困难、大汗等红旗情境，必须先进入求助分支，不进入这194条内容记录的普通抽取流程。应及时呼叫120，不自行驾车，不等待按摩、调息、三分钟观察或设备读数改善。美国资料的911不直接放入中国大陆行动文案；120由中国卫健/急救机构来源支撑。不生成阿司匹林、硝酸甘油的自行使用剂量或替代医生的用药指令。

## 来源记录

本轮使用官方机构、医院或其官方发布页面。未复制正文长引文、人物照片、穴位图或指南插画；下表标明每条实际采用的范围，完整链接保存在 sources.json。访问日期为2026-11-05；部分站点正文会对自动访问返回412或超时，因此保留经检索可核对的题名、地址与局部定位信息，不承诺外链永远可用。

| ID | 原始来源 | 在本项目中的范围 |
| --- | --- | --- |
| `NHC_POINTS_2024` | [国家卫生健康委员会2024年7月5日新闻发布会文字实录](https://www.nhc.gov.cn/xcs/c100122/202407/bb4a843e4eba4b279d2282164f4121a3.shtml) | 劳宫、内关的大致定位；卡片不采纳疾病治疗宣称。 |
| `NHC_SHENMEN_2024` | [国家卫生健康委员会2024年7月22日新闻发布会文字实录](https://www.nhc.gov.cn/xcs/c100122/202407/67c75ece979540c582f1b2a989602765.shtml) | 神门定位与日常轻柔接触；不据此承诺安眠或治疗心脏疾病。 |
| `NHC_POINTS_2026` | [国家卫生健康委员会2026年1月13日新闻发布会文字实录](https://www.nhc.gov.cn/xcs/c100122/202601/b805b5cc607941f1a4445a8b297bf4e9.shtml) | 太阳、内关穴位科普；只取定位信息，不采用急性症状疗效说法。 |
| `SPORT_ADAPT` | [老人习练健身气功 需从自身实际出发](https://www.sport.gov.cn/n20001280/n20001265/n20066978/c30109457/content.html) | 坐式、减幅、自然呼吸与出现不适停练的原则；本项目逐卡改编未经临床验证。 |
| `SPORT_FORMS` | [八段锦定式动作](https://www.sport.gov.cn/n20001280/n20001265/n20067611/c20106840/content.html) | 八段锦八式名称及传统组织方式；式名不表示本项目承诺疗效。 |
| `NHS_SEATED` | [Sitting exercises](https://www.nhs.uk/live-well/exercise/sitting-exercises/) | 稳定座椅、缓慢舒适的坐姿活动；微卡是项目缩减起步，不等于完整训练。 |
| `NHS_HAND` | [Hand Exercises](https://www.ruh.nhs.uk/patients/patient_information/HTH021_Hand_Exercises.pdf) | 手部活动宜轻柔、不过度用力；不作为损伤康复处方。 |
| `NHS_BREATH` | [Breathing exercises for stress](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/) | 舒适坐姿与轻柔、不强迫的呼吸；30秒仅做觉察起步。 |
| `NHC_DIET_2025` | [“健康饮食、合理膳食”核心信息](https://www.nhc.gov.cn/sps/c100088/202505/6b7a718abd4848e8a3e98fc561a8858b.shtml) | 蔬果、全谷物与水产品多样搭配，适量购买与少盐少油；不支持具体食物治病。 |
| `NHC_LITERACY` | [中国公民健康素养——基本知识与技能（2024年版）](https://www.nhc.gov.cn/xcs/c100123/202405/73a4927142f34152abed875634a3c13b.shtml) | 食物多样、饮食卫生、保健食品不能替代药品等一般健康知识。 |
| `NHC_DIET_2017` | [合理膳食健康教育核心信息及释义](https://www.nhc.gov.cn/xcs/cbcl/201706/d7d8ff3889be445b8bfb86a5efea952f.shtml) | 均衡膳食、粗细搭配和清淡进食的背景原则；不生成疾病食疗处方。 |
| `CDC_LABEL` | [Nutrition Facts Label and Your Health](https://www.cdc.gov/healthy-weight-growth/healthy-eating/nutrition-label.html) | 阅读钠含量并在相同标示单位下比较；不把美国标签格式视为中国强制格式。 |
| `NHLBI_SLEEP` | [Healthy Sleep Habits](https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits) | 规律作息、适宜睡眠环境与睡前减少刺激。 |
| `NIH_INSOMNIA` | [Insomnia](https://health.nih.gov/health-topics-a-z/insomnia) | 安静环境、日常节律和轻音乐等睡前习惯；不能代替失眠诊疗。 |
| `CDC_SLEEP_ROOM` | [Improve Your Sleep Environment](https://archive.cdc.gov/www_cdc_gov/niosh/emres/longhourstraining/environment.html) | 睡眠光线、噪声及夜间通路整理的一般建议。 |
| `WHO_STRESS` | [Doing What Matters in Times of Stress: An Illustrated Guide](https://www.who.int/publications/i/item/9789240003927) | 情绪觉察、接地、善待自己与价值行动等自助原则；卡片文字为项目原创短提示，不复制指南插画。 |
| `CDC_HEAT` | [Preventing Heat-Related Illness](https://www.cdc.gov/extreme-heat/prevention/) | 高温时减少热暴露、选择较凉的环境；饮水须服从个人医疗安排。 |
| `CDC_CVD_HEAT` | [Clinical Overview of Heat and Cardiovascular Disease](https://www.cdc.gov/heat-health/hcp/clinical-overview/heat-and-people-with-cardiovascular-disease.html) | 高温与心血管风险、个体化药物与液体计划、家人联系安排。 |
| `AHA_HF` | [Lifestyle Changes for Heart Failure](https://www.heart.org/en/health-topics/heart-failure/treatment-options-for-heart-failure/lifestyle-changes-for-heart-failure) | 心衰患者液体、盐分与活动应按个人医疗计划；不统一要求限液量。 |
| `CDC_FEET` | [Diabetes and Your Feet](https://www.cdc.gov/diabetes/diabetes-complications/diabetes-and-your-feet.html) | 糖尿病足部检查、合适鞋袜、避免浸泡与热损伤。 |
| `NCCIH_HERBS` | [6 Tips: How Herbs Can Interact With Medicines](https://www.nccih.nih.gov/health/tips/tips-how-herbs-can-interact-with-medicines) | 草药、补充剂与药物可能相互作用；不构成任何具体复方安全或有效的证明。 |
| `AHA_MEDICATION` | [Medication Interactions: Food, Supplements and Other Drugs](https://www.heart.org/en/health-topics/consumer-healthcare/medication-information/medication-interactions-food-supplements-and-other-drugs) | 记录用药及补充剂、向医生或药师核对相互作用。 |
| `NHC_EMERGENCY` | [国家卫生健康委员会2025年11月21日新闻发布会文字实录](https://www.nhc.gov.cn/xcs/c100122/202511/b622555670fa4f2388eb35f1c339195f.shtml) | 疑似心肌梗死及时呼叫120，不自行驾车或擅自用药；不等待微行为见效。 |
| `BEIJING_120` | [每周急救话题：胸痛的识别与处置](https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jzjj/202211/t20221102_2850165.html) | 胸痛识别与及时120求助；平时演练不能延迟真实急救。 |
| `NIMH_SELFCARE` | [Caring for Your Mental Health](https://www.nimh.nih.gov/health/topics/caring-for-your-mental-health) | 低压力爱好、音乐、目标安排与亲友支持；日常提示不替代精神心理诊疗。 |
| `WHO_LISTENING` | [Deafness and hearing loss: Safe listening](https://www.who.int/news-room/questions-and-answers/item/deafness-and-hearing-loss-safe-listening) | 降低音量、缩短高声暴露并安排聆听休息；不按乐曲五行宣称疾病治疗效果。 |
| `CQ_HEGU` | [重庆市中医药新冠防治居家健康指引（第一版）](https://wsjkw.cq.gov.cn/zwgk_242/wsjklymsxx/jkfw_266458/zcwj_266459/202212/W020221214733933714168.pdf) | 仅用合谷位置与孕期避用提示；不采用其中防疫、药物、熏灸或按摩疗效方案。 |
| `DF_YINTANG` | [失眠别硬扛，中医按摩“按”出好睡眠](https://dongfangyy.com.cn/Html/News/Articles/12985.html) | 仅取印堂位于两眉之间的定位；不声称轻触能治疗失眠。 |
| `BEIJING_ZUSANLI` | [春季防治感冒有妙招](https://www.beijing.gov.cn/fuwu/bmfw/jhsyfwzdzx/2022sjwsr/kpyz/202204/t20220401_2651985.html) | 仅取足三里定位；不采用用力按压或治疗感冒的说法。 |
| `BEIJING_TAIYANG` | [有效恢复视力的小方法](https://zyj.beijing.gov.cn/ylfw/ysbj/201912/t20191223_1412455.html) | 仅核对太阳穴定位；不采纳标题所述视力恢复效果，不采用眼眶刮擦。 |

| `NHS_DRY_MOUTH` | [Dry mouth](https://www.nhs.uk/symptoms/dry-mouth/) | 仅用于口干的普通口腔照护、处方药不自行停用及持续症状就诊提示。饮水建议不外推至心衰、限液或吞咽困难者。 |
| `NHS_DEHYDRATION` | [Dehydration](https://www.nhs.uk/conditions/dehydration/) | 用于口干、尿色及尿量变化需要综合观察和明显脱水迹象求助；不凭尿黄确诊脱水或中医证型。 |
| `NIDDK_DIARRHEA` | [Symptoms & Causes of Diarrhea](https://www.niddk.nih.gov/health-information/digestive-diseases/diarrhea/symptoms-causes) | 用于便溏与腹泻信息整理、持续时间和严重伴随症状的求助边界；不提供止泻药或家庭补液配方。 |
| `NHS_TASTE` | [Metallic taste](https://www.nhs.uk/symptoms/metallic-taste/) | 仅借鉴持续或不明原因味觉变化应咨询、药物相关问题应由药师核对的原则；金属味与口苦不是同一症状，不据此诊断。 |
| `NHS_INDIGESTION` | [Indigestion](https://www.nhs.uk/conditions/indigestion/) | 用于记录餐后反流样感受与不适食物、持续问题求助；不把口苦直接诊断为反流，不推荐自行增减药物。 |
| `NHS_NUTRITION` | [How to improve your nutrition](https://www.nhsinform.scot/illnesses-and-conditions/nutritional/how-to-improve-your-nutrition/) | 仅采用食欲差时减少备餐负担、小份熟悉食物与寻求帮助原则。高能量增重、全脂或加糖建议不用于本库的通用慢病人群。 |
| `NHS_MALNUTRITION` | [Malnutrition](https://www.nhs.uk/conditions/malnutrition/) | 用于持续食欲下降和非主动体重下降需要专业评估的提示，不由应用诊断营养不良。 |
| `NHS_ANGER` | [Anger](https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/anger/) | 用于给回应留时间、辨认情绪、向可信任的人寻求支持。身体急症不归因于生气；不把压抑情绪判为气滞证。 |
| `NIH_EMOTIONAL` | [Emotional Wellness Toolkit](https://www.nih.gov/health-information/your-healthiest-self-wellness-toolkits/emotional-wellness-toolkit) | 只用愉悦爱好、温和自我关照、注意当下、整理优先事项和社会联系的一般原则。具体写画观察任务是项目原创，不采用该页屏气计数方法。 |
| `NHS_WELLBEING` | [5 steps to mental wellbeing](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/five-steps-to-mental-wellbeing/) | 支持学习爱好、与亲友联系和关注身边事物的一般背景，不证明某张30秒卡具有治疗作用。 |
| `FDA_PRODUCE` | [Selecting and Serving Produce Safely](https://www.fda.gov/food/buy-store-serve-safe-food/selecting-and-serving-produce-safely) | 用于清水清洗蔬果、生熟分开、切开后冷藏与破损腐坏处理。卡片只选一个准备环节，不承诺30秒完成整餐清洁。 |
| `FDA_FOOD` | [Safe Food Handling](https://www.fda.gov/food/buy-store-serve-safe-food/safe-food-handling) | 用于手卫生、易腐食物及时冷藏、食物安全准备；不以闻味或尝一口判断食品安全。 |
| `NHS_POLLEN` | [Hay fever](https://www.nhs.uk/conditions/hay-fever/) | 用于已知花粉敏感者减少接触的生活安排，不将植物观察卡当作过敏治疗。 |
| `HKO_TERMS` | [二十四节气的日期及时间资料](https://www.hko.gov.hk/tc/gts/astronomy/Solar_Term.htm) | 只支持节气名称及历法组织。节气不等于当地天气，24张具体行动为项目按季节主题编排。 |
| `NHS_URINE` | [Urinary tract infections (UTIs)](https://www.nhs.uk/conditions/urinary-tract-infections-utis/) | 只用于尿色变化若伴疼痛、血尿、发热等需评估的提示；不由尿黄诊断感染，也不提供抗生素建议。 |
| `UKHSA_COLD` | [Keeping warm and well: staying safe in cold weather](https://www.gov.uk/government/publications/keeping-warm-and-well-staying-safe-in-cold-weather/top-tips-for-keeping-warm-and-well-this-winter) | 用于室内保暖、减少冷风直吹、分层衣物等一般安排；以当地天气和实际舒适度为准，不把英国求助号码用于中国用户。 |
| `BEIJING_FIVE_TONES` | [曲抚人心 乐为良药](https://zyj.beijing.gov.cn/sy/whkp/202303/t20230327_2945698.html) | 仅核对宫、商、角、徵、羽五音传统名称及文化背景；不采纳文中疗效、脏腑或证型映射为本应用推荐依据。 |
| `HGNU_PENTATONIC` | [中国五声调式音阶（教学资料）](https://music.hgnu.edu.cn/_upload/article/files/3e/2d/0eda070749ccb70498dbbabfd436/6f4b6b57-96c5-43ba-a0af-7aacd8edf865.pdf) | 用于五声音阶与五种调式主音的基本音乐概念。应用音景为原创程序编排，不复制资料中的乐曲或医学主张。 |

## 本轮扩充的实际差异

新增102张启用基础卡，未将同一动作的左右侧、不同标题或同义措辞拆成多张。保留原有7个穴位与8式坐姿起步，不为了数量继续加入难定位穴位或高幅度动作。新动作分布于具体口腔照护、症状记录与咨询准备、食品储存和备餐环节、摄影/绘画/植物观察、家庭交流、床上静息、24节气情境和5个可播放调式；本轮不把动作变体计入基础卡数量。

### 六类新描述的使用边界

| 用户描述键 | 卡片范围 | 本次支持 | 不做什么 |
| --- | --- | --- | --- |
| dry_mouth | DM01—DM04 | 有条件的小口饮水、熟悉润唇用品、日常口腔清洁安排、时段记录 | 不推断上火或糖尿病；DM01排除心衰、限液、肾病和吞咽困难。 |
| bitter_taste | BT01—BT04 | 记录时间与饮食关联、准备口腔检查问题、核对近期用品名称 | 不由口苦判断肝胆病或证型，不自行停药。 |
| loose_stool | LS01—LS04 | 次数与持续时间、手卫生、用药线索、就诊说明整理 | 不将便溏当排毒，不开止泻药或自制补液方。 |
| yellow_urine | YU01—YU04 | 同时描述尿量、伴随感受、个人液体安排和变化经过 | 不凭颜色确认脱水或湿热，不统一增加水、汤、茶。 |
| poor_appetite | PA01—PA04 | 符合原饮食安排的小份熟悉食物、备餐帮忙、食量记录、进餐安排 | 不对慢病人群通用推荐高糖高脂增重；吞咽困难与持续呕吐不试吃。 |
| suppressed_emotion | SU01—SU06 | 不发送的草稿、事实与猜想区分、表达感受、预约沟通、倾听支持、回应前停顿 | 不把身体不适归咎情绪，不据此确诊气滞。 |

普通卡仍先服从急性症状和就医分支。NIDDK提示持续腹泻、频繁便次、明显脱水、血/黑便、剧痛等应及时求助；65岁以上等人群还需更早联系医疗团队。尿量明显下降、尿痛/发热/血尿、持续食欲下降或非主动变瘦也不能用生活卡延后评估。具体分支由引擎核对，本文不把所有单次轻微描述都等同急症。

### 24节气与五音

ST01—ST24 每个节气一张不同的准备或观察行动，`solarTerms: [中文节气名]` 是专属硬匹配；未到该节气不入池。`preferredSolarTerms` 与 `preferredSeasons` 的原有软偏好保留，不能与专属字段混用。香港天文台仅支持历法组织，具体雨、雪、温差或花粉仍要依当地当天的事实判断。节气专属卡全为白天室内准备，不要求真的下雪、外出、进补或清晨锻炼。

MU01—MU05 对应宫、商、角、徵、羽，`audio: {mode, durationSeconds: 30}` 的mode依次为gong、shang、jue、zhi、yu。音景由应用用Web Audio原创编排，用户点开始才播放，支持音量与停止；不是从外部平台搬运的歌曲。传统来源仅用于五音名称与音乐组织，不采用其疾病、器官或体质疗效映射。五张都为 `nightSafe: false`，普通日间情绪、疲劳与明确音乐意愿可成为候选；明确指定调式时需保持对应模式。播放之前仍排除需要注意道路、正在进食、耳部不适等情境。

### 新字段与夜间文案

- `action`：当前为首步行动摘要字符串；`steps`仍保留完整2—3步，不被摘要替代。
- `reason`：与`why`保持一致，为本次内容理由；不是模型生成的诊断。
- `safety_note`：一条与本动作相关的使用条件。
- `incompatibilities`：全部已知情境/症状的硬排除键；例如eating、road_attention、active_task，不因新情绪标签而忽略它们。
- `requiresGettingUp: false`：所有允许夜间的卡明确标记床上可完成。NT卡中的枕被微调只针对原本就在手边的褶皱，不要求寻找物品或改变规定睡姿。
- 常规夜间卡的标题、步骤、理由与小提示不含心血管风险、血压、胸闷、心悸等警示内容；必要的排除仍在元数据和急症分支中执行。

## 复核结果与后续

`test/content.test.mjs` 检查结构、唯一ID、步骤数量、来源引用、合法时辰/体质/场景、全时辰安静候选、禁用药茶、按摩及运动急性排除、八式数量、低频预演和偏好元数据。本轮13组内容测试全部通过；额外覆盖24节气唯一映射、六类新增主诉、夜间无起床与焦虑提示、五音音频契约、24小时字段和饮水限制。它验证数据与产品约定，没有证明医学效果，也不是医师签署。

正式用于慢病管理前仍需由有资质的专业人员审阅具体坐姿改编、穴位说明和疾病限制；内容或适用人群扩展时重新核对。这个待办不影响当前竞赛预览对内容流程的展示，但不能在介绍中写成“已完成临床安全认证”。



## 0.11 轻微头晕分级参考

[NHS：Dizziness](https://www.nhs.uk/symptoms/dizziness/) 支持头晕时先休息、缓慢移动并避免突然起身和危险活动。本版的原位自然呼吸／支撑休息只作为轻微情境中的舒适支持，不对原因作诊断，也不宣称穴位治疗效果。

[AHA：Warning Signs of a Heart Attack](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack) 与 [NHS：Symptoms of a stroke](https://www.nhs.uk/conditions/stroke/symptoms/) 用于保留伴胸部危险表现、冷汗、晕厥、单侧无力或言语异常等紧急路径，不能将其降为普通舒缓。核对日期：2026-11-05。

## 0.12 程度、变化与支持动作

本轮将“症状名称”和“严重程度、变化经过、危险伴随表现”分开处理。未说明程度保留为未知；没有提到其他表现不自动记为否认。30秒后的“差不多”只表示这次短观察无明显变化，不自动变成“长期持续不缓解”。

- [NHS：Heart palpitations](https://www.nhs.uk/symptoms/heart-palpitations/)：单独短暂心慌、持续不消退、伴胸痛或呼吸困难／近晕厥不能混为同一个分支。持续不消退或危险组合不能通过反复换舒缓卡延后求助。
- [NHS：Pins and needles](https://www.nhs.uk/symptoms/pins-and-needles/)：明确受压的短暂麻感可先解除压迫；持续或反复需评估。NP01只在用户明确提及部位受压时使用，NP02仅记录手麻的位置与变化；均不作诊断、不用针刺或强力试握。
- [NHS：Dizziness](https://www.nhs.uk/symptoms/dizziness/)：支持原位休息、缓慢活动；不适时不安排突然起身、弯腰或危险任务。
- [NHS：Symptoms of a stroke](https://www.nhs.uk/conditions/stroke/symptoms/)：突发单侧麻木／无力、言语或面部异常仍优先求助，不能凭“有一点”或手表读数放行。

卡库共198条，196条启用。七张既有原位安静卡和两张新发麻观察／减压卡带有 `reviewedSupport` 元数据，只供经过分级后的支持分支使用；不是把全部 `acute_symptoms` 禁忌删除。原有道路注意、进食、夜间、个体限制和24小时冷却仍参与筛选。该标记代表项目对动作范围的审核，不代表经过临床试验证明有效。核对日期：2026-11-05。


### 0.12 日常饥饿与情绪连接

新增FD31／FD32使用 [NHS均衡饮食说明](https://www.nhs.uk/live-well/eat-well/how-to-eat-a-balanced-diet/eating-a-balanced-diet/) 的一般餐食与特殊饮食需沿用个人方案原则；不提供份量处方，不用于处理低血糖。熟悉食物选择与请求备餐帮助是不同动作，只有用户明确饥饿时进入候选。

家庭问候与自愿联系参考 [NHS心理健康五个步骤](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/five-steps-to-mental-wellbeing/)。想家、低落不等于疾病诊断，也不自动触发自伤询问；不愿联系的人可以选择不发送的文字或安静陪伴。网页不会代替用户发送消息。
