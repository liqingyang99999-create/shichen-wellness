import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import cards from '../data/cards.json' with {type:'json'};
import {decide,analyzeText} from '../lib/decision.mjs';
import {mergeCardHistory,recordCardSelection} from '../lib/card-history.mjs';
import {retainSafetyDecision,mergeUnresolvedComplaint} from '../lib/safety-state.mjs';
import * as actionRecheck from '../lib/action-recheck.mjs';
import {completedActionRecord} from '../lib/conversation.mjs';
import {adherenceSummary} from '../lib/records.mjs';
import {shichen} from '../lib/time.mjs';
import {createAiRequestGate} from '../lib/web-ai-client.mjs';

// Execute the production App handlers and its actual completion-sheet callback,
// with React-style deferred state updates. No copied completion/recheck logic.
const appText=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const app=ts.createSourceFile('App.tsx',appText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const experience=app.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Experience');
const names=['complete','recheck','evaluate','applyDecision','stopAudio','clearTags'];
const functions=names.map(name=>{
  const fn=experience.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(fn,`production handler ${name} exists`);return fn.getText(app);
});
let completionReply;
function visit(node){
  if(ts.isJsxAttribute(node)&&node.name.getText(app)==='onReply'&&node.initializer?.expression){
    const expression=node.initializer.expression;
    if(ts.isArrowFunction(expression)&&expression.getText(app).includes('complete();recheck(outcome);'))completionReply=expression.getText(app);
  }
  ts.forEachChild(node,visit);
}
visit(experience);assert.ok(completionReply,'use the actual combined completion/recheck UI event');
const persistence=experience.body.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(app)==='useEffect'&&n.expression.arguments[0]?.getText(app).includes('JSON.stringify({version:1,data:store})')).expression.arguments[0].getText(app);
const panelsText=readFileSync(new URL('../src/HealthPanels.tsx',import.meta.url),'utf8');
const panels=ts.createSourceFile('HealthPanels.tsx',panelsText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const calendar=panels.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='CalendarPanel').getText(panels);
const code=ts.transpileModule(`${functions.join('\n')}\nconst completionReply=${completionReply};\nconst persistAfterRender=${persistence};\n${calendar}\nObject.assign(globalThis,{complete,recheck,completionReply,persistAfterRender,CalendarPanel});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const now='2026-11-06T15:30:00+08:00';
const dayKey=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const clockLabel=value=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(){
  const text='我刚生气，头有点晕，没有其他不舒服';
  const vitals={source:'simulation',measuredAt:now,quality:'good',heartRate:72};
  const card=cards.find(c=>c.id==='EM03');
  const decision={...decide({text,now,vitals},cards),card};
  const completions=Array.from({length:15},(_,i)=>({id:`old-${i}`,cardId:'NP02',title:'原有完成',completedAt:i===14?'2026-11-06T08:10:00+08:00':'2026-11-05T08:10:00+08:00'}));
  const initial={profile:{constitution:{primary:[]}},activeSafety:actionRecheck.safetySnapshot(decision,text),completions,bp:[],recentCards:[],notices:[],symptoms:[],opportunities:[],weather:null};
  const queue=[],saved=new Map();let id=0;
  const context={exports:{},require:name=>{assert.equal(name,'react/jsx-runtime');return jsxRuntime;},
    cards,decide,analyzeText,mergeCardHistory,recordCardSelection,retainSafetyDecision,mergeUnresolvedComplaint,...actionRecheck,
    completedActionRecord,adherenceSummary,shichen,dayKey,clockLabel,SparkBars:()=>null,
    key:'test-demo',now,simulationTime:now,before:'',after:'',running:false,sequence:2,lastSource:'manual',store:initial,
    latest:{current:{store:initial,vitals,now,lastText:text,result:decision}},activeAction:{current:{id:'completed-em03',card}},completedSessions:{current:new Set()},
    musicRequest:{current:0},startingMusic:{current:false},music:{stop(){}},tagContext:{current:[]},dialogue:{current:[]},
    aiGate:{current:createAiRequestGate()},aiContext:{current:null},phase:{current:null},confirmedReading:{current:null},
    localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},uid:()=>`new-${++id}`,
    // Rechecks should be handled locally; an accidental model branch fails this test.
    fetchAiDecision(){throw Error('recheck unexpectedly requested AI');},
  };
  for(const name of ['Store','Result','LastText','AiBusy','AiStatus','ShowQuestion','Message','Sequence','Running','Seconds','History','Panel','Opportunity','Before','After','Tags'])context[`set${name}`]=value=>queue.push([name[0].toLowerCase()+name.slice(1),value]);
  vm.createContext(context);vm.runInContext(code,context);
  return {context,initial,saved,flush(){
    for(const [key,value] of queue.splice(0))context[key]=typeof value==='function'?value(context[key]):value;
    context.latest.current={...context.latest.current,store:context.store,result:context.result};
    context.persistAfterRender();return context.store;
  }};
}
function elements(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(elements);return [node,...elements(node.props?.children)];}
function textOf(node){if(Array.isArray(node))return node.map(textOf).join('');if(node&&typeof node==='object')return textOf(node.props?.children);return node==null?'':String(node);}

test('completion then improved in the same UI event preserves the new record, calendar and persisted reload',()=>{
  const h=harness();h.context.completionReply('improved');
  assert.equal(h.context.latest.current.store.completions.length,16,'next synchronous assessment sees the newly completed action');
  const store=h.flush();assert.equal(store.completions.length,16);assert.equal(store.activeSafety,null);
  assert.equal(store.completions.at(-1).cardId,'EM03');assert.equal(store.completions.at(-1).completedAt,now);
  assert.equal(h.context.result.reason,'symptoms_improved');
  const restored=JSON.parse(h.saved.get('test-demo')).data;
  assert.deepEqual(restored.completions,plain(store.completions));
  const calendar=h.context.CalendarPanel({store:restored,now,competition:true});
  assert.equal(textOf(elements(calendar).find(n=>n.props?.className==='care-points').props.children[0]),'16');
  assert.match(textOf(elements(calendar).find(n=>n.props?.className==='today')),/2 次/);
  assert.match(textOf(calendar),/感受身下的安稳支撑2026-11-06 15:30/);
  assert.deepEqual(restored.bp,[]);assert.deepEqual(restored.recentCards,[]);
});

test('unchanged and worse completion feedback retain the completion and graded care state',()=>{
  for(const outcome of ['unchanged','worse']){
    const h=harness();h.context.completionReply(outcome);const store=h.flush();
    assert.equal(store.completions.length,16,outcome);assert.equal(store.completions.at(-1).cardId,'EM03');
    assert.equal(h.context.result.reason,outcome==='unchanged'?'graded_support_unchanged':'symptoms_medical_review');
    assert.ok(store.activeSafety);assert.notEqual(h.context.result.level,'emergency');
    assert.equal(JSON.parse(h.saved.get('test-demo')).data.completions.length,16);
  }
});

test('two same-event completion clicks and a subsequent recheck count the session only once',()=>{
  const h=harness();h.context.complete();h.context.complete();h.context.recheck('improved');
  const store=h.flush();assert.equal(store.completions.filter(c=>c.id==='completed-em03').length,1);
  assert.equal(store.completions.length,16);assert.equal(h.context.activeAction.current,null);
});
