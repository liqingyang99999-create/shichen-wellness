# 内容库结构与维护

唯一运行数据源是 `server/catalog.json`。当前版本 `2026-11-04-expanded-v2` 包含 136 张基础行动卡、58 条来源、24 条节气内容和 12 个时辰主题。基础内容按 `origin` 分为传统动作／传统主题启发 64 张、现代日常 72 张；135 张进入各自允许时段的普通候选库。保留的通风参考卡 `23` 没有普通适用小时，不主动进入普通池。

时辰与节气用于组织文化和生活主题，不证明某时刻的经络状态、个体风险或行动收益。传统原文、现代科普和项目编写内容分别注明；依据传统主题设计的现代步骤不冒称古籍原始操作。来源的存在也不等于每张卡已经得到疗效验证。

## 数据表

| 集合 | 主要字段 | 用途 |
| --- | --- | --- |
| `cards` | `id,title,category,steps,scene,duration,sourceId,tags,hours,night,origin,requirements` | 固定动作、适用情境、时间与执行条件 |
| `sources` | `id,title,label,text,url` | 出处、主题或改写范围说明；项目编写内容允许没有外部 URL |
| `solar` | `term,date,quote,author,title,url,theme,action,base_ids` | 节气日期、诗句出处与当次提示；当前使用 2026 年上海日期 |
| `meridians` | `label,meridian,theme,start,end,ids` | 时辰标签、经络文化名称及内容组织主题 |

卡片的 `sourceId` 必须指向有效来源。`steps` 与 `duration` 是界面和 API 展示的固定内容；模型不能改写次数、力度、顺序或时长。`scene` 说明适用情境，`source.text` 说明出处与整理范围，`steps` 给出本次行动。

## 执行条件

`hours` 明确列出 0–23 的小时。空数组表示不进入普通池，不能解释为全天。`night` 表示是否可进入夜间轻行动池；不覆盖用户的睡眠、勿扰或暂停状态。

```json
{
  "requirements": {
    "trueFields": ["sitting", "canCloseEyes"],
    "falseFields": []
  }
}
```

上例要求明确坐稳且可闭目。天气相关动作可另加 `weatherFresh:true`；不依赖天气时应省略该字段，`false` 代表要求天气状态不新鲜，并非“不检查天气”。`trueFields` 要求字段严格为 `true`；`falseFields` 要求严格为 `false`；缺失或未知都不能充当已确认值。

支持条件：`canLeaveSeat`、`canLookFar`、`canCloseEyes`、`sitting`、`spaceEnough`、`hasSupport`、`waterAvailable`、`headphones`、`atMeal`、`goingOut` 以及 `weather.rain`。存在显式 `requirements:{}` 表示没有额外声明条件；没有此对象的旧卡才使用兼容规则。新增内容统一使用声明式条件。

## 编辑与验证

1. 检查候选动作是否与现有步骤重复；不要仅换标题增加数量。
2. 确认来源能支持所写主题，并在 `source.text` 说明哪些是现代整理。未找到外部原文时写清项目编写，不伪造出处。
3. 写明可执行的固定步骤与场景，设置真实需要的条件；不要通过取消条件或随意扩展小时掩盖候选不足。
4. 用稳定、唯一的 ID 关联来源，检查 `origin`、标签、适用小时和夜间属性，并更新内容版本。
5. 运行 `npm test`。结构与重复检查验证关联、已知条件字段和归一化动作文本；覆盖审计遍历 24 小时、4 种意图及条件组合，记录候选不足。

普通池目标是每种许可提醒的测试情境至少 8 张候选，同时保留最近 3 张去重。该覆盖目标只评价候选可用性，不评价临床效果，也不取消睡眠、勿扰、每日次数或间隔限制。生成报告位于 `test/reports/coverage.json`；报告与实际测试日志一起解读，不能把模型模拟响应当作真实 AI 联调。

引用网页仍属于原发布者；来源链接用于查证与归属，不代表项目取得对整个外部页面的再发布许可。分享截图或材料时保留来源与现代整理说明。
