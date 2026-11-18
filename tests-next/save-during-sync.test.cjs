// A save that is still on its way when an automatic sync reloads the same account must not be lost:
// the next save has to go out with the new revision instead of a stale one (a false CONFLICT that
// blocked the study button and every other write until a manual sync).
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {createPersonalWriter}=require('../next/access/personal-writes');
const base={revision:5,catalog_revision:9,catalog:{materials:[{id:'m',title:'Shared'},{id:'n',title:'Other'}],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[],questionSessions:[],preferences:{}}};
function slowClient(){const calls=[];let resolve=null;return {calls,answer:data=>resolve({data}),rpc:(name,args)=>{calls.push(args);return new Promise(r=>resolve=r);}};}
(async()=>{
 const owner='jeferson';
 // 1. The sync read the cloud before the save landed: the save goes on top of what it loaded.
 {const client=slowClient(),writer=createPersonalWriter(client,()=>owner);writer.load(base,owner);
  const pending=writer.save({kind:'pomodoro-settings',settings:{config:{focusMin:55,shortMin:5,targetSets:4,longEnabled:true,longMin:15,longEvery:4,flow:false},sound:{enabled:false,id:'rain',muted:false},prefs:{effects:true,notify:true}}});
  writer.load(structuredClone(base),owner);
  client.answer({revision:6,catalog_revision:9});const saved=await pending;
  assert.equal(saved.revision,6);assert.equal(writer.snapshot.revision,6);assert.equal(writer.snapshot.payload.preferences.pomodoroSettings.config.focusMin,55);assert.equal(writer.blocked,false);
  const next=writer.save({kind:'study',id:'n',studied:true});assert.equal(client.calls.at(-1).p_revision,6,'the next save must not reuse the old revision');
  client.answer({revision:7,catalog_revision:9});await next;assert.equal(writer.snapshot.payload.materials.find(m=>m.id==='n').read,true);}
 // 2. The sync read the cloud after the save landed: its copy already has the save and is kept.
 {const client=slowClient(),writer=createPersonalWriter(client,()=>owner);writer.load(base,owner);
  const pending=writer.save({kind:'study',id:'m',studied:true});
  const newer=structuredClone(base);newer.revision=6;newer.payload.materials=[{id:'m',title:'Shared',read:true,questionEntries:[]}];writer.load(newer,owner);
  client.answer({revision:6,catalog_revision:9});await pending;assert.equal(writer.snapshot.revision,6);assert.equal(writer.snapshot.payload.materials[0].read,true);}
 // 3. Another device saved too: the loaded copy is newer than both, so it wins untouched.
 {const client=slowClient(),writer=createPersonalWriter(client,()=>owner);writer.load(base,owner);
  const pending=writer.save({kind:'study',id:'m',studied:true});
  const other=structuredClone(base);other.revision=8;writer.load(other,owner);
  client.answer({revision:6,catalog_revision:9});await pending;assert.equal(writer.snapshot.revision,8);assert.deepEqual(writer.snapshot.payload.materials,[]);}
 // 4. Signing out or switching accounts mid-save still refuses the answer.
 {const client=slowClient(),writer=createPersonalWriter(client,()=>owner);writer.load(base,owner);
  const pending=writer.save({kind:'study',id:'m',studied:true});writer.load(base,'outra-conta');
  client.answer({revision:6,catalog_revision:9});await assert.rejects(pending,/conta mudou/);}
 // 5. The page re-enables the buttons when such a save finishes, even though a sync came in between.
 const page=fs.readFileSync(path.join(__dirname,'../next/directions/connected.js'),'utf8');
 assert.match(page,/finally\{[^]*?if\(owner===currentSession\?\.user\?\.id\)\{setSaving\(false\);/);
 console.log('PASS a save that overlaps an automatic sync keeps its revision, so the next save (study button) does not hit a false conflict');
})().catch(e=>{console.error(e);process.exitCode=1});
