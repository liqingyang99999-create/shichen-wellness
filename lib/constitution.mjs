import questionnaires from '../data/questionnaires.json' with { type: 'json' };

export const CONSTITUTION_KEYS = Object.freeze(questionnaires.types.map(type => type.id));
const labels = Object.fromEntries(questionnaires.types.map(type => [type.id, type.label]));
const biasedKeys = CONSTITUTION_KEYS.filter(key => key !== 'balanced');
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const answerPresent = (answers, id) => owns(answers, id) && answers[id] !== undefined && answers[id] !== null;

export class ConstitutionInputError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ConstitutionInputError';
    this.code = code;
    Object.assign(this, details);
  }
}

function validateAnswers(mode, answers) {
  if (mode !== 'simplified' && mode !== 'standard') {
    throw new ConstitutionInputError('INVALID_MODE', '请选择简测或标准框架版。');
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new ConstitutionInputError('INVALID_ANSWERS', '问卷回答需要按题目保存。');
  }
  const questionnaire = questionnaires[mode];
  const known = new Set(questionnaire.items.map(item => item.id));
  const unknown = Object.keys(answers).filter(id => !known.has(id));
  if (unknown.length) {
    throw new ConstitutionInputError('UNKNOWN_ITEMS', '回答中含有不属于本问卷的题目，请重新选择问卷。', { unknown });
  }
  const invalid = questionnaire.items
    .filter(item => answerPresent(answers, item.id) && (!Number.isInteger(answers[item.id]) || answers[item.id] < 1 || answers[item.id] > 5))
    .map(item => item.id);
  if (invalid.length) {
    throw new ConstitutionInputError('INVALID_VALUES', '每题请选择一个1至5的选项。', { invalid });
  }
  const selectedBranches = {};
  const missing = questionnaire.items.filter(item => !item.exclusiveGroup && !answerPresent(answers, item.id)).map(item => item.id);
  for (const group of questionnaire.exclusiveGroups ?? []) {
    const members = questionnaire.items.filter(item => item.exclusiveGroup === group.id);
    const answered = members.filter(item => answerPresent(answers, item.id));
    if (answered.length > 1) {
      throw new ConstitutionInputError('AMBIGUOUS_BRANCH', '适用分支只能回答其中一题，请清除另一分支的回答。', { group: group.id });
    }
    if (answered.length === 0) missing.push(group.id);
    else selectedBranches[group.id] = answered[0].id;
  }
  if (missing.length) {
    throw new ConstitutionInputError('INCOMPLETE', '请完成适用题目后再查看结果；未回答不会按“没有”计分。', { missing });
  }
  return { questionnaire, selectedBranches };
}

function ordered(keys, scores) {
  return [...keys].sort((a, b) => scores[b] - scores[a] || CONSTITUTION_KEYS.indexOf(a) - CONSTITUTION_KEYS.indexOf(b));
}

function standardResult(answers, questionnaire, selectedBranches) {
  const scores = {};
  const rawScores = {};
  const itemCounts = {};
  for (const key of CONSTITUTION_KEYS) {
    const entries = questionnaire.scoring[key];
    const raw = entries.reduce((sum, entry) => {
      const id = entry.itemId ?? selectedBranches[entry.exclusiveGroup];
      return sum + (entry.reverse ? 6 - answers[id] : answers[id]);
    }, 0);
    rawScores[key] = raw;
    itemCounts[key] = entries.length;
    // Classify the full precision score, never a rounded display value.
    scores[key] = ((raw - entries.length) / (entries.length * 4)) * 100;
  }
  const classifications = Object.fromEntries(biasedKeys.map(key => [key, scores[key] >= 40 ? 'yes' : scores[key] >= 30 ? 'inclination' : 'no']));
  classifications.balanced = scores.balanced >= 60
    ? biasedKeys.every(key => scores[key] < 30) ? 'yes'
      : biasedKeys.every(key => scores[key] < 40) ? 'basic' : 'no'
    : 'no';
  const present = ordered(biasedKeys.filter(key => classifications[key] === 'yes'), scores);
  const tendencies = ordered(biasedKeys.filter(key => classifications[key] === 'inclination'), scores);
  let primary;
  let label;
  if (present.length) {
    primary = present;
    label = `${present.map(key => labels[key]).join('、')}相关表现`;
  } else if (classifications.balanced === 'yes' || classifications.balanced === 'basic') {
    primary = ['balanced'];
    label = classifications.balanced === 'yes' ? '平和表现较多' : '基本符合平和表现';
  } else if (tendencies.length) {
    primary = tendencies;
    label = `${tendencies.map(key => labels[key]).join('、')}倾向`;
  } else {
    primary = [];
    label = '暂未形成明确类型';
  }
  const tendencyText = tendencies.length ? `另外可留意${tendencies.map(key => labels[key]).join('、')}的倾向。` : '';
  return {
    mode: 'standard', scores, primary, label, method: questionnaire.method,
    summary: `依据近一年的自述，${label}。${tendencyText}多种表现可以共存；题意改写版尚未经等效性验证，结果只供生活观察与专业沟通，不是疾病诊断。`,
    classifications, tendencies, rawScores, itemCounts,
    answeredCount: questionnaire.items.filter(item => answerPresent(answers, item.id)).length,
    selectedBranches, standardId: questionnaire.standardId, scoreMeaning: '标准规则转化分（不是概率）',
    validated: false
  };
}

function simplifiedResult(answers, questionnaire) {
  const scores = Object.fromEntries(questionnaire.items.map(item => [item.type, (answers[item.id] - 1) * 25]));
  const thresholds = questionnaire.thresholds;
  const prominent = ordered(biasedKeys.filter(key => scores[key] >= thresholds.prominentFrequency), scores);
  const balanced = scores.balanced >= thresholds.balancedFrequency && biasedKeys.every(key => scores[key] <= thresholds.otherMaximumForBalanced);
  const primary = prominent.length ? prominent : balanced ? ['balanced'] : [];
  const label = prominent.length ? `${prominent.map(key => labels[key]).join('、')}相关表现较多（简测）`
    : balanced ? '平和相关表现较多（简测）' : '暂未见突出的倾向（简测）';
  return {
    mode: 'simplified', scores, primary, label, method: questionnaire.method,
    summary: `${label}。每类只问一个表现，分数仅表示所选回答的频率；多个倾向可共存，不能由此判定体质或疾病。可进一步完成标准框架版。`,
    classifications: Object.fromEntries(CONSTITUTION_KEYS.map(key => [key, primary.includes(key) ? 'prominent' : 'not_prominent'])),
    tendencies: [], answeredCount: questionnaire.items.length,
    scoreMeaning: questionnaire.scoreMeaning, validated: false
  };
}

/** Complete answers only. Does not infer absent answers, sex branch, or a single diagnosis. */
export function scoreConstitution(mode, answers) {
  const { questionnaire, selectedBranches } = validateAnswers(mode, answers);
  return mode === 'standard'
    ? standardResult(answers, questionnaire, selectedBranches)
    : simplifiedResult(answers, questionnaire);
}
