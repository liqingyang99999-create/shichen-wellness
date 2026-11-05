import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/questionnaires.json' with { type: 'json' };
import { scoreConstitution, CONSTITUTION_KEYS, ConstitutionInputError } from '../lib/constitution.mjs';

const complete = (mode, value = 1, branch = 'female') => Object.fromEntries(data[mode].items
  .filter(item => !item.appliesTo || item.appliesTo === branch).map(item => [item.id, value]));
const balancedAnswers = () => ({ ...complete('standard'), C01: 5 });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('现行附录结构：九类、27个独立条目、三项共用、实际每人26题', () => {
  assert.equal(data.standard.standardId, 'GB/T 46939—2025');
  assert.equal(data.types.length, 9);
  assert.equal(data.simplified.items.length, 9);
  assert.equal(data.standard.items.length, 27);
  assert.equal(new Set(data.standard.items.map(item => item.id)).size, 27);
  assert.equal(data.standard.items.filter(item => item.sourceRefs.length === 2).length, 3);
  assert.deepEqual(data.standard.items.filter(item => item.exclusiveGroup).map(item => item.id), ['C17', 'C18']);
  assert.equal(Object.keys(complete('standard')).length, 26);
});

test('精力充足、其余表现没有：平和100，其余为0', () => {
  const result = scoreConstitution('standard', balancedAnswers());
  assert.equal(result.scores.balanced, 100);
  for (const key of CONSTITUTION_KEYS.filter(key => key !== 'balanced')) assert.equal(result.scores[key], 0);
  assert.deepEqual(result.primary, ['balanced']);
  assert.equal(result.classifications.balanced, 'yes');
  assert.equal(result.answeredCount, 26);
  assert.deepEqual(result.itemCounts, { balanced:4, qi_deficiency:3, yang_deficiency:3, yin_deficiency:3, phlegm_damp:3, damp_heat:3, blood_stasis:3, qi_stagnation:3, special:4 });
});

test('三项共用回答在平和中反向，在对应偏颇类型中正向', () => {
  for (const [id, key] of [['C02', 'qi_deficiency'], ['C03', 'qi_stagnation'], ['C04', 'yang_deficiency']]) {
    const result = scoreConstitution('standard', { ...balancedAnswers(), [id]:5 });
    assert.equal(result.scores.balanced, 75);
    close(result.scores[key], 100 / 3);
    assert.equal(result.classifications[key], 'inclination');
    assert.equal(result.classifications.balanced, 'basic');
  }
});

test('适用分支同分等价，湿热只按三个适用条目计算', () => {
  const female = scoreConstitution('standard', { ...complete('standard', 1, 'female'), C17:5 });
  const male = scoreConstitution('standard', { ...complete('standard', 1, 'male'), C18:5 });
  close(female.scores.damp_heat, 100 / 3);
  assert.deepEqual(female.scores, male.scores);
  assert.equal(female.rawScores.damp_heat, 7);
  assert.equal(female.itemCounts.damp_heat, 3);
});

test('平和高分但存在偏颇类型达到40，不得仍给平和结果', () => {
  const result = scoreConstitution('standard', { ...balancedAnswers(), C02:2, C05:5 });
  close(result.scores.qi_deficiency, 125 / 3);
  assert.equal(result.classifications.qi_deficiency, 'yes');
  assert.equal(result.classifications.balanced, 'no');
  assert.deepEqual(result.primary, ['qi_deficiency']);
});

test('所有偏颇低于30也不能省略平和自身至少60的要求', () => {
  const answers = { ...complete('standard'), C01:1, C03:2, C04:3 };
  const below = scoreConstitution('standard', answers);
  assert.equal(below.scores.balanced, 56.25);
  assert.equal(below.classifications.balanced, 'no');
  assert.deepEqual(below.primary, []);
  const above = scoreConstitution('standard', { ...answers, C01:2 });
  assert.equal(above.scores.balanced, 62.5);
  assert.equal(above.classifications.balanced, 'yes');
});

test('偏颇30附近与40附近用未取整转化分判断，保留倾向和基本平和', () => {
  const below30 = scoreConstitution('standard', { ...balancedAnswers(), C24:2, C25:2, C26:2, C27:2 });
  assert.equal(below30.scores.special, 25);
  assert.equal(below30.classifications.special, 'no');
  const over30 = scoreConstitution('standard', { ...balancedAnswers(), C24:3, C25:2, C26:2, C27:2 });
  assert.equal(over30.scores.special, 31.25);
  assert.equal(over30.classifications.special, 'inclination');
  assert.equal(over30.classifications.balanced, 'basic');
  const below40 = scoreConstitution('standard', { ...balancedAnswers(), C24:4, C25:2, C26:2, C27:2 });
  assert.equal(below40.scores.special, 37.5);
  assert.equal(below40.classifications.special, 'inclination');
  const over40 = scoreConstitution('standard', { ...balancedAnswers(), C24:5, C25:2, C26:2, C27:2 });
  assert.equal(over40.scores.special, 43.75);
  assert.equal(over40.classifications.special, 'yes');
});

test('多个达到标准阈值的类型同时保留，不强选一个或改称诊断', () => {
  const result = scoreConstitution('standard', { ...balancedAnswers(), C09:5, C10:5, C11:5, C24:5, C25:5, C26:5, C27:5 });
  assert.deepEqual(result.primary, ['yin_deficiency', 'special']);
  assert.equal(result.classifications.balanced, 'no');
  assert.match(result.summary, /多种表现可以共存/);
  assert.match(result.summary, /不是疾病诊断/);
});

test('标准版全部选3按公式得到各类50，不误解为平和或阴性', () => {
  const result = scoreConstitution('standard', complete('standard', 3));
  for (const value of Object.values(result.scores)) assert.equal(value, 50);
  assert.equal(result.primary.length, 8);
  assert.equal(result.classifications.balanced, 'no');
});

test('标准版全部选1或5仍正确处理反向题，不会超出0至100', () => {
  const low = scoreConstitution('standard', complete('standard', 1));
  assert.equal(low.scores.balanced, 75);
  const high = scoreConstitution('standard', complete('standard', 5));
  assert.equal(high.scores.balanced, 25);
  assert.equal(high.primary.length, 8);
  for (const result of [low, high]) for (const value of Object.values(result.scores)) assert.ok(value >= 0 && value <= 100);
});

test('简测全部选3不会照搬标准阈值判成八种体质', () => {
  const result = scoreConstitution('simplified', complete('simplified', 3));
  assert.deepEqual(result.primary, []);
  assert.equal(result.validated, false);
  assert.match(result.method, /未经量表验证/);
  assert.match(result.scoreMeaning, /不是概率/);
});

test('简测按经常或总是提示相关表现，允许多个且不从低分默认平和', () => {
  assert.deepEqual(scoreConstitution('simplified', complete('simplified', 1)).primary, []);
  assert.deepEqual(scoreConstitution('simplified', { ...complete('simplified', 1), S01:5 }).primary, ['balanced']);
  const result = scoreConstitution('simplified', { ...complete('simplified', 1), S01:5, S02:4, S08:5 });
  assert.deepEqual(result.primary, ['qi_stagnation', 'qi_deficiency']);
  assert.equal(result.scores.qi_deficiency, 75);
});

test('任何漏题不补成1，未选适用分支不能计算完整结果', () => {
  const standard = balancedAnswers();
  delete standard.C05;
  assert.throws(() => scoreConstitution('standard', standard), error => error instanceof ConstitutionInputError && error.code === 'INCOMPLETE' && error.missing.includes('C05'));
  const noBranch = balancedAnswers();
  delete noBranch.C17;
  assert.throws(() => scoreConstitution('standard', noBranch), error => error.code === 'INCOMPLETE' && error.missing.includes('damp_heat_sex'));
  assert.throws(() => scoreConstitution('simplified', { ...complete('simplified'), S03:null }), error => error.code === 'INCOMPLETE' && error.missing.includes('S03'));
});

test('拒绝同时回答两支，避免分母增大或重复计入湿热', () => {
  assert.throws(() => scoreConstitution('standard', { ...balancedAnswers(), C18:1 }), error => error.code === 'AMBIGUOUS_BRANCH');
});

test('非法值、错模式和跨问卷残留答案明确报错', () => {
  for (const value of [0, 6, 1.5, '3', true, NaN, Infinity]) {
    assert.throws(() => scoreConstitution('simplified', { ...complete('simplified'), S02:value }), error => error.code === 'INVALID_VALUES');
  }
  assert.throws(() => scoreConstitution('other', {}), error => error.code === 'INVALID_MODE');
  assert.throws(() => scoreConstitution('standard', []), error => error.code === 'INVALID_ANSWERS');
  assert.throws(() => scoreConstitution('standard', { ...balancedAnswers(), S01:3 }), error => error.code === 'UNKNOWN_ITEMS');
});

test('计分不改写原始答案，显示和再次评分可复核', () => {
  const answers = Object.freeze(balancedAnswers());
  const result = scoreConstitution('standard', answers);
  assert.equal(answers.C02, 1);
  assert.deepEqual(scoreConstitution('standard', answers), result);
});
