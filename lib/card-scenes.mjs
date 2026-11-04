// Decorative nature photographs only. Card instructions remain real HTML text.
export const CARD_SCENE_IDS = Object.freeze(['bamboo', 'leaves', 'water', 'night', 'flowers', 'tea', 'meadow', 'sky']);

const plain = value => typeof value === 'string' ? value : '';
function stableChoice(pool, identity, sceneCycle) {
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const cycle = Number.isSafeInteger(sceneCycle) && sceneCycle >= 0 ? sceneCycle % pool.length : 0;
  return pool[((hash % pool.length) + cycle) % pool.length];
}

/** Explicit subjects take precedence over clock time; never replace a tea card with generic night scenery. */
export function cardScene(card, now, sceneCycle = 0) {
  const tags = Array.isArray(card?.tags) ? card.tags.filter(tag => typeof tag === 'string') : [];
  const text = `${plain(card?.title)} ${plain(card?.category)} ${tags.join(' ')}`;
  const identity = plain(card?.id) || text;
  const pick = pool => stableChoice(pool, identity, sceneCycle);

  if (tags.includes('flowers') || /赏花|鲜花|花朵|花瓣|花枝|花草|花园|插花|看花/.test(text)) return 'flowers';
  if (tags.includes('tea') || /泡茶|饮茶|喝茶|品茶|茶香|茶叶|茶园|茶树|茶杯/.test(text)) return 'tea';
  if (tags.some(tag => tag === 'qigong' || tag === 'stretch') || /八段锦|舒展|伸展|拉伸|导引|托天|挽弓|攒拳|摇头摆尾|调理脾胃|背后七颠|攀足/.test(text)) return 'meadow';
  if (tags.includes('daydream') || /发呆|看云|观云|云朵|放空/.test(text)) return 'sky';
  if (tags.includes('plants') || /盆栽|绿植|植物|枝叶|叶片|养花|浇花/.test(text)) return 'leaves';
  if (tags.some(tag => tag === 'journal' || tag === 'drawing') || /日记|随笔|涂鸦|绘画|画画/.test(text)) return pick(['bamboo', 'water']);
  if (tags.includes('photo') || /拍照|摄影/.test(text)) return pick(['meadow', 'leaves', 'water']);
  if (tags.includes('family')) return pick(['bamboo', 'water']);
  if (tags.includes('emotion')) return pick(['water', 'sky']);
  if (tags.some(tag => tag === 'food' || tag.startsWith('meal-')) || /食养/.test(text)) return 'leaves';
  if (/眼|远眺|远方|看远|屏幕|阅读/.test(text)) return pick(['bamboo', 'sky']);
  if (/饮|水|呼吸|静心|安静/.test(text)) return 'water';
  if (/节气|出门|外出|起居|整理|秋|冬/.test(text)) return 'leaves';

  // Clock-based scenery is a fallback for cards without an identifiable visual subject.
  const time = String(now ?? '').match(/[T ](\d{2}):\d{2}/);
  const hour = time ? Number(time[1]) : NaN;
  if ((hour >= 21 && hour <= 23) || (hour >= 0 && hour < 6) || /睡前|熄|晚间|夜间/.test(text)) return 'night';
  return pick(['bamboo', 'water']);
}
