import test from 'node:test';
import assert from 'node:assert/strict';
import questionnaire from '../data/questionnaires.json' with {type:'json'};
import {scoreConstitution} from '../lib/constitution.mjs';
import {constitutionBadge} from '../lib/presentation.mjs';
import {restoreExperienceStore,saveProfileSnapshot} from '../lib/profile-state.mjs';
import {aiRequestBody} from '../lib/web-ai-client.mjs';

function memory(){const values=new Map();return {setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)};}
const allRare=()=>scoreConstitution('simplified',Object.fromEntries(questionnaire.simplified.items.map(item=>[item.id,2])));
const demoProfile={name:'模拟资料',age:65,conditions:['hypertension'],constitution:{primary:['qi_deficiency'],scores:{qi_deficiency:75}},assessmentMode:'simplified'};

test('nine rare answers replace demo constitution in persistence, home badge and next AI context',()=>{
 const storage=memory(),result=allRare();assert.deepEqual(result.primary,[]);assert.match(result.label,/暂未见突出/);
 const previous={profile:demoProfile,bp:[{systolic:130}],completions:[{id:'keep'}],activeSafety:null};
 const next=saveProfileSnapshot(previous,{...demoProfile,constitution:result},'demo',storage);
 assert.deepEqual(next.profile.constitution.primary,[]);assert.equal(constitutionBadge(next.profile),'暂无明确体质倾向');
 const saved=JSON.parse(storage.getItem('demo')).data;
 const restored=restoreExperienceStore(saved,true,()=>{throw Error('saved assessment must not fall back to demo');});
 assert.deepEqual(restored.profile.constitution.scores,result.scores);
 assert.equal(constitutionBadge(restored.profile),'暂无明确体质倾向');
 const request=aiRequestBody({profile:{...restored.profile,constitution:restored.profile.constitution.primary},text:''});
 assert.deepEqual(request.context.profile.constitution,[]);
 assert.deepEqual(next.completions,previous.completions);assert.deepEqual(next.bp,previous.bp);
 assert.deepEqual(previous.profile.constitution.primary,['qi_deficiency']);
});

test('result snapshot is durable before leaving the result page and isolated by mode',()=>{
 const storage=memory();storage.setItem('personal',JSON.stringify({version:1,data:{profile:demoProfile}}));
 const profile={...demoProfile,constitution:allRare()};
 const next=saveProfileSnapshot({profile:demoProfile,activeSafety:null},profile,'demo',storage);
 profile.constitution.primary.push('qi_deficiency');
 assert.deepEqual(next.profile.constitution.primary,[]);
 assert.deepEqual(JSON.parse(storage.getItem('demo')).data.profile.constitution.primary,[]);
 assert.deepEqual(JSON.parse(storage.getItem('personal')).data.profile.constitution.primary,['qi_deficiency']);
});

test('editing constitution does not silently dismiss an unresolved emergency',()=>{
 const activeSafety={decision:{level:'emergency'},text:'现在剧烈胸痛'};
 const next=saveProfileSnapshot({profile:demoProfile,activeSafety},{...demoProfile,constitution:allRare()},'demo',memory());
 assert.strictEqual(next.activeSafety,activeSafety);
});

test('competition hydration only seeds the demo when a profile has never been stored',()=>{
 const existing={profile:{...demoProfile,constitution:allRare()}};let seeded=0;
 const seed=()=>{seeded++;return {profile:demoProfile};};
 assert.strictEqual(restoreExperienceStore(existing,true,seed),existing);
 assert.deepEqual(restoreExperienceStore({profile:null},true,seed).profile,demoProfile);
 const empty={profile:null};assert.strictEqual(restoreExperienceStore(empty,false,seed),empty);
 assert.equal(seeded,1);
});
