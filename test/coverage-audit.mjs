import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalogData from '../server/catalog.json' with { type: 'json' };
import { LIFESTYLE_FOCUS_VALUES } from '../lib/context.mjs';
import { evaluateEligibility, retrieveCatalog, REQUIREMENT_BOOLEAN_FIELDS, requirementsConfigError } from '../server/engine.mjs';

export const COVERAGE_FIELDS = [...REQUIREMENT_BOOLEAN_FIELDS, 'weatherFresh'];
export const COVERAGE_INTENTS = ['eye', 'move', 'quiet', 'general'];

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const normalizedText = value => String(value).normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '').toLowerCase();
function duplicates(entries, key) {
  const groups = new Map();
  for (const entry of entries) {
    const value = key(entry);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) || []), entry.id]);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([value, ids]) => ({ value, ids }));
}

export function auditCatalogSchema(catalog) {
  const errors = [], cards = catalog.cards || [], sources = catalog.sources || [];
  const tags = new Set(['eye', 'shoulder', 'hand', 'walk', 'breath', 'quiet', 'sleep', 'food', 'water', 'environment', 'meal-before', 'meal-during', 'meal-after', 'seasonal-food', 'emotion', 'recovery', ...LIFESTYLE_FOCUS_VALUES]);
  for (const card of cards) {
    const fail = reason => errors.push({ cardId: card.id, reason });
    for (const field of ['id', 'title', 'category', 'scene', 'duration', 'sourceId']) if (!nonempty(card[field])) fail(`${field}须为非空文字`);
    if (!Array.isArray(card.steps) || !card.steps.length || !card.steps.every(nonempty)) fail('steps须为非空动作文字数组');
    if (!Array.isArray(card.tags) || !card.tags.length || card.tags.some(tag => !tags.has(tag))) fail('tags缺失或含未知标签');
    if (!Array.isArray(card.hours) || card.hours.some(hour => !Number.isInteger(hour) || hour < 0 || hour > 23) || new Set(card.hours).size !== card.hours.length) fail('hours须为不重复的0至23整数数组');
    if (typeof card.night !== 'boolean') fail('night须为明确布尔值');
    if (card.explicitOnly !== undefined && typeof card.explicitOnly !== 'boolean') fail('explicitOnly须为明确布尔值');
    if (card.explicitOnly && card.tags?.filter(tag => LIFESTYLE_FOCUS_VALUES.includes(tag)).length !== 1) fail('明确请求卡须声明唯一可识别的生活活动标签');
    if (card.mealPhases !== undefined && (!Array.isArray(card.mealPhases) || !card.mealPhases.length || card.mealPhases.some(phase => !['before','during','after'].includes(phase)) || new Set(card.mealPhases).size !== card.mealPhases.length)) fail('mealPhases须为明确不重复的用餐阶段数组');
    if (card.tags?.some(tag => /^meal-/.test(tag)) && !card.mealPhases) fail('用餐标签须声明mealPhases');
    if (card.seasons !== undefined && (!Array.isArray(card.seasons) || !card.seasons.length || card.seasons.some(season => !['spring','summer','autumn','winter'].includes(season)))) fail('seasons含未知季节');
    if (card.tags?.includes('seasonal-food') && (!card.seasons?.length || card.mealPhases?.length !== 1 || card.mealPhases[0] !== 'before')) fail('食材搭配须声明季节且限于餐前');
    if (!Object.hasOwn(card, 'requirements')) fail('新目录应明确迁移requirements，允许空对象');
    else { const error = requirementsConfigError(card.requirements); if (error) fail(error); }
    if (!sources.some(source => source.id === card.sourceId && nonempty(source.title) && nonempty(source.text))) fail('来源引用缺失或没有标题/正文');
  }
  for (const source of sources) {
    for (const field of ['id', 'title', 'label', 'text']) if (!nonempty(source[field])) errors.push({ sourceId: source.id, reason: `${field}须为非空文字` });
    if (typeof source.url !== 'string') errors.push({ sourceId: source.id, reason: 'url须明确为网址或项目自编内容的空字符串' });
    else if (source.url) {
      try { if (!['http:', 'https:'].includes(new URL(source.url).protocol)) throw new Error(); }
      catch { errors.push({ sourceId: source.id, reason: '来源网址格式无效' }); }
    }
  }
  const duplicateCardIds = duplicates(cards, c => c.id), duplicateSourceIds = duplicates(sources, s => s.id);
  const duplicateActions = duplicates(cards, c => Array.isArray(c.steps) ? normalizedText(c.steps.join('')) : '');
  return { errors, duplicateCardIds, duplicateSourceIds, duplicateActions,
    actionComparison: '完整步骤经Unicode、空白和标点归一化后的文字重复检查，不代表语义等价审查；同一古籍可被多卡引用。',
    passed: !errors.length && !duplicateCardIds.length && !duplicateSourceIds.length && !duplicateActions.length };
}

function inputCombination(mask) {
  const snapshot = { weather: {} }, conditions = {};
  COVERAGE_FIELDS.forEach((field, bit) => {
    const value = Boolean(mask & (2 ** bit));
    conditions[field] = value;
    if (field === 'weather.rain') snapshot.weather.rain = value;
    else if (field !== 'weatherFresh') snapshot[field] = value;
  });
  return { snapshot, conditions, weatherFresh: conditions.weatherFresh };
}

/** No model, network, clock or application state mutations. Exhaustive boolean
 * inputs use production retrieval + eligibility. Recent-three coverage follows
 * from distinct eligible IDs: deleting any <=3 IDs from >=4 leaves >=1.
 */
export function auditCoverage(catalog = catalogData, { minimumCandidates = 8 } = {}) {
  const started = performance.now();
  const schema = auditCatalogSchema(catalog);
  const combinations = Array.from({ length: 2 ** COVERAGE_FIELDS.length }, (_, mask) => inputCombination(mask));
  const gaps = new Map(), bucketSummary = [];
  let totalCases = 0, insufficientCases = 0, hardInsufficientCases = 0, emptyCases = 0, minimum = Infinity, expectedSafetyBlocks = 0, evaluatedCases = 0;
  const ids = (catalog.cards || []).map(c => c.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const missingSourceIds = (catalog.cards || []).filter(c => !(catalog.sources || []).some(s => s.id === c.sourceId && s.title && s.text)).map(c => c.id);
  for (let hour = 0; hour < 24; hour++) {
    // Every hour-matching grounded card scores >=3 regardless of model query.
    const cards = retrieveCatalog({ queryText: '', tags: [], hour }, catalog).map(hit => hit.card);
    const clockNight = hour >= 23 || hour < 7;
    // Daytime outside a custom usual-awake interval is also treated as night.
    for (const night of clockNight ? [true] : [false, true]) {
      for (const intent of COVERAGE_INTENTS) {
        let bucketMinimum = Infinity, bucketInsufficient = 0, bucketEmpty = 0;
        for (const combination of combinations) {
          const snapshot = { ...combination.snapshot, intent };
          const context = { hour, night, day: '2026-11-04', weatherFresh: combination.weatherFresh };
          const eligible = cards.filter(card => evaluateEligibility({ card, snapshot, context, state: { recentCards: [] } }).eligible);
          const candidateIds = [...new Set(eligible.map(card => card.id))].sort();
          totalCases++;
          // During a meal, a conflicting eye/movement request has no promise of
          // a compatible action. A safe pause is coverage, not missing content.
          if (snapshot.atMeal === true && ['eye','move'].includes(intent) && !candidateIds.length) {expectedSafetyBlocks++;continue;}
          evaluatedCases++;
          const required = snapshot.atMeal === true ? 4 : minimumCandidates;
          minimum = Math.min(minimum, candidateIds.length);
          bucketMinimum = Math.min(bucketMinimum, candidateIds.length);
          if (candidateIds.length < 4) hardInsufficientCases++;
          if (!candidateIds.length) { emptyCases++; bucketEmpty++; }
          if (candidateIds.length < required) {
            insufficientCases++; bucketInsufficient++;
            const groupKey = `${hour}|${night}|${intent}|${candidateIds.join(',')}`;
            let group = gaps.get(groupKey);
            if (!group) {
              group = { hour, night, intent, candidateIds, candidateCount: candidateIds.length,
                minimumNeeded: required, missingCount: required - candidateIds.length,
                hardFloorViolation: candidateIds.length < 4,
                equivalentConditionCases: 0, exampleConditions: combination.conditions,
                worstRecentCards: candidateIds.slice(0, 3), remainingAfterWorstRecentThree: Math.max(0, candidateIds.length - 3) };
              gaps.set(groupKey, group);
            }
            group.equivalentConditionCases++;
          }
        }
        bucketSummary.push({ hour, night, intent, cases: combinations.length, minimumCandidates: bucketMinimum, insufficientCases: bucketInsufficient, emptyCases: bucketEmpty });
      }
    }
  }
  return {
    method: 'production lexical retrieval and card eligibility; exhaustive booleans; exact recent-three cardinality bound',
    catalogVersion: catalog.version || null, cardCount: ids.length, minimumRequired: minimumCandidates, hardMinimumRequired: 4,
    fields: COVERAGE_FIELDS, combinationsPerBucket: combinations.length,
    normalClockCases: 24 * COVERAGE_INTENTS.length * combinations.length,
    additionalCustomRestHourCases: 16 * COVERAGE_INTENTS.length * combinations.length,
    totalCases, evaluatedCases, expectedSafetyBlocks, minimumByContext: {ordinary:minimumCandidates,duringMeal:4}, minimumCandidates: minimum, guaranteedRemainingAfterAnyRecentThree: Math.max(0, minimum - 3),
    insufficientCases, hardInsufficientCases, emptyCases, duplicateIds, missingSourceIds,
    hardFloorPassed: hardInsufficientCases === 0 && duplicateIds.length === 0 && missingSourceIds.length === 0,
    schema,
    passed: insufficientCases === 0 && schema.passed && duplicateIds.length === 0 && missingSourceIds.length === 0,
    gateBaseline: { sleepState: 'awake', busy: false, paused: false, resting: false, dnd: [], ordinaryCount: 0, lastReminderAt: null },
    scope: 'Ordinary reminders when the separate global gate permits display: ordinary pools require 8 candidates, meal-safe pools require 4. Conflicting eating + eye/move inputs may safely pause and are counted separately. Specific before/after/emotion priority and all-hour recent-three cases are covered in situation-priority tests. Unknown conditions never mean false.',
    durationMs: Math.round(performance.now() - started), buckets: bucketSummary,
    insufficientGroups: [...gaps.values()].sort((a, b) => a.hour - b.hour || Number(a.night) - Number(b.night) || a.intent.localeCompare(b.intent) || a.candidateCount - b.candidateCount)
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditCoverage();
  const index = process.argv.indexOf('--output');
  const output = path.resolve(index >= 0 ? process.argv[index + 1] : 'test/reports/coverage.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cardCount: report.cardCount, totalCases: report.totalCases,
    minimumRequired: report.minimumRequired, minimumCandidates: report.minimumCandidates, insufficientCases: report.insufficientCases, hardInsufficientCases: report.hardInsufficientCases,
    insufficientGroups: report.insufficientGroups.length, emptyCases: report.emptyCases, durationMs: report.durationMs, report: output }));
  if (!report.passed && !process.argv.includes('--allow-gaps')) process.exitCode = 1;
}
