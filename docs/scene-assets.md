# 按卡片内容选择自然配图

更新：2026-11-04。

本次通过内置 image_gen 分别生成四张独立背景，保留既有竹林、银杏、湖水与月夜，共八张项目内 WebP。图片是 AI 生成的装饰性自然景观，并非真实地点纪实或动作/穴位示意。知识来源按钮仍对应卡片内容来源，不代表背景图片来源。没有人物、人体、手部、穴位照片或外部图片热链。

## 新增素材

| 文件 | 内容 | 尺寸 | 文件大小 |
|---|---|---|---:|
| `public/scenes/flowers.webp` | 鲜花 | 800 × 1200 | 114,890 字节 |
| `public/scenes/tea.webp` | 茶园与茶树 | 800 × 1200 | 80,992 字节 |
| `public/scenes/meadow.webp` | 山林与草地 | 800 × 1200 | 115,178 字节 |
| `public/scenes/sky.webp` | 白云与远山 | 800 × 1200 | 29,556 字节 |

原图均为 1024 × 1536（2:3）；分别检查了景物、构图、人物/人体与文字排除要求。原始 PNG 已另存到工作区 `work/scene-images/`；生成器默认原件保留。供网页使用的 WebP 仅使用 FFmpeg 做等比例缩放和格式压缩（质量 84），未裁切、拼接或改变景物。四张新图合计 340,616 字节。

## 匹配规则

明确内容先于时钟：鲜花卡使用鲜花；品茶卡使用茶园；舒展与八段锦使用山林草地；发呆/看云使用云景；植物观察使用枝叶。日记和绘画从竹林、湖水中选择；心绪卡从湖水、云景中选择；摄影从山林、枝叶、湖水中选择。眼部休息使用竹林或云景。只有没有明确景物主题的通用夜间卡才按时间退回月夜，避免夜间所有卡片变成同一张夜景。

同类多图按 `card.id` 稳定散列，同卡重绘不闪换。可选 `sceneCycle` 仅在同类池内切换；鲜花、茶、八段锦等明确主题仍固定匹配。函数只返回八个已登记文件名，不采用模型传入的图片 URL。

映射实现：`lib/card-scenes.mjs`；公共入口仍为 `sceneForCard(card, now, sceneCycle = 0)`。定向测试覆盖 24 小时主题保持、稳定变化、无标签标题、异常字段与每张本地 WebP 存在性。代码选择与素材检查不等同于实际手机整页排版验收；最新界面最终效果需结合手机长文卡片确认。

## 完整生成提示词

机器可读完整清单保存在 [scene-assets.prompts.json](./scene-assets.prompts.json)。以下提示词均通过内置工具生成，没有使用 CLI 或外部 API 后备路线。

### flowers

```text
Use case: photorealistic-natural.
Asset type: portrait 2:3 background photograph for a calm Chinese daily wellness mobile action card.
Style: realistic quiet nature photography, delicate natural textures, soft diffused daylight, restrained pale sage, ivory and soft sky colors. A cohesive, fresh, refined editorial photograph, not an illustration.
Composition: subjects and detail primarily in the lower half, upper half naturally bright and spacious with pale atmospheric haze and low contrast for dark readable UI text added later. Fill the image, no frame. Natural depth, no artificial graphic gradient, no collage.
Constraints: landscape/nature only, no people, human bodies, faces, hands, silhouettes, anatomy, acupuncture diagrams, buildings, signs, captions, letters, logos or watermarks. No rendered UI.
Primary request: a sunlit garden edge with fresh white and pale pink cosmos flowers on green stems, photographed naturally at their height. The clearly visible fresh blossoms cluster in the lower half, with soft distant greenery, morning light and light mist behind them. Gentle delicate flowers must be unmistakable.
```

### tea

```text
Use case: photorealistic-natural.
Asset type: portrait 2:3 background photograph for a calm Chinese daily wellness mobile action card.
Style: realistic quiet nature photography, delicate natural textures, soft diffused daylight, restrained pale sage, ivory and soft sky colors. A cohesive, fresh, refined editorial photograph, not an illustration.
Composition: subjects and detail primarily in the lower half, upper half naturally bright and spacious with pale atmospheric haze and low contrast for dark readable UI text added later. Fill the image, no frame. Natural depth, no artificial graphic gradient, no collage.
Constraints: landscape/nature only, no people, human bodies, faces, hands, silhouettes, anatomy, acupuncture diagrams, buildings, signs, captions, letters, logos or watermarks. No rendered UI.
Primary request: an empty tea garden on softly rolling hills, vibrant fresh tea bushes and small tender tea leaves in the foreground lower half, layered curving rows fading into morning mist. Muted light green hills at the bottom and a luminous pale misty sky above. Tea plants are the visual subject, no tea cups or utensils.
```

### meadow

```text
Use case: photorealistic-natural.
Asset type: portrait 2:3 background photograph for a calm Chinese daily wellness mobile action card.
Style: realistic quiet nature photography, delicate natural textures, soft diffused daylight, restrained pale sage, ivory and soft sky colors. A cohesive, fresh, refined editorial photograph, not an illustration.
Composition: subjects and detail primarily in the lower half, upper half naturally bright and spacious with pale atmospheric haze and low contrast for dark readable UI text added later. Fill the image, no frame. Natural depth, no artificial graphic gradient, no collage.
Constraints: landscape/nature only, no people, human bodies, faces, hands, silhouettes, anatomy, acupuncture diagrams, buildings, signs, captions, letters, logos or watermarks. No rendered UI.
Primary request: a quiet open green meadow at the edge of a natural mountain forest, soft grasses and a few ferns in the lower foreground, distant tall forest trees and mountain layers receding into clean pale morning mist. Spacious and gentle, evoking a place to slowly stretch outdoors. No people, trail figures or exercise equipment.
```

### sky

```text
Use case: photorealistic-natural.
Asset type: portrait 2:3 background photograph for a calm Chinese daily wellness mobile action card.
Style: realistic quiet nature photography, delicate natural textures, soft diffused daylight, restrained pale sage, ivory and soft sky colors. A cohesive, fresh, refined editorial photograph, not an illustration.
Composition: subjects and detail primarily in the lower half, upper half naturally bright and spacious with pale atmospheric haze and low contrast for dark readable UI text added later. Fill the image, no frame. Natural depth, no artificial graphic gradient, no collage.
Constraints: landscape/nature only, no people, human bodies, faces, hands, silhouettes, anatomy, acupuncture diagrams, buildings, signs, captions, letters, logos or watermarks. No rendered UI.
Primary request: soft white cumulus clouds drifting over a very low distant blue-green mountain horizon. Beautiful luminous cloud forms in the lower half; an expansive pale clear blue sky fading naturally into bright atmospheric haze in the upper half. An airy unhurried landscape for resting attention and daydreaming. No buildings, aircraft, birds or symbols.
```
