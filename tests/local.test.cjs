const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))};
const legacy=[{id:'m',subject:'Pediatria',title:'Aula',notes:'Privado',questions:10,correct:8,wrong:2}];
storage.setItem('medstudy_materials_v1',JSON.stringify(legacy));
const dom=new JSDOM(read('index.html'),{url:'file:///test/index.html',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;Object.defineProperty(w,'localStorage',{value:storage});w.confirm=()=>true;w.fetch=async()=>({ok:false});w.PELEJA_BACKEND={};w.PELEJA_ACADEMIC_DATA={materials:[],exams:[]};
try{
w.eval(read('supabase-config.js'));w.supabase={createClient(){throw new Error('File mode must stay offline even with configured backend');}};
w.eval(read('storage.js'));w.eval(read('app.js').replace(/\}\)\(\);\s*$/,'globalThis.__app={state,els,openSimulationModal,handleSimulationSubmit};\n})();'));
w.eval(read('cloud.js'));
w.document.body.dataset.accessState='granted';w.eval(read('ui.js'));
assert.equal(w.PELEJA_STORAGE.scope,'local:vinicius');assert(map.has('peleja_legacy_backup_v1:vinicius'));
assert.equal(storage.getItem('medstudy_materials_v1'),JSON.stringify(legacy));
console.log('PASS Local owner migration preserves original and recovery copy');
const button=w.document.getElementById('primaryActionBtn');button.focus();w.__app.openSimulationModal();await tick();
const modal=w.document.getElementById('simulationModal');assert(modal.contains(w.document.activeElement));assert(w.document.querySelector('.app-shell').inert);
w.__app.els.simulationNameInput.value='Teste';w.__app.els.simulationDateInput.value='2026-09-28';w.__app.els.simulationQuestionCountInput.value='2';w.document.getElementById('generateSimulationQuestionsBtn').click();
const first=w.document.querySelector('[data-field="userAnswer"]');first.value='B';w.document.querySelector('[data-field="correctAnswer"]').value='B';
w.__app.els.simulationQuestionCountInput.value='3';w.document.getElementById('generateSimulationQuestionsBtn').click();assert.equal(w.document.querySelector('[data-field="userAnswer"]').value,'B');
w.__app.handleSimulationSubmit({preventDefault(){}});await tick();assert.equal(w.__app.state.simulations[0].questions.length,3);assert.equal(w.document.activeElement.id,button.id, 'focus after save');
w.__app.openSimulationModal(w.__app.state.simulations[0]);await tick();assert.equal(w.document.querySelector('[data-field="userAnswer"]').value,'B');
const last=modal.querySelector('button[type="submit"]');last.focus();last.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));assert.equal(w.document.activeElement.id,'closeSimulationModal');
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();assert(!modal.classList.contains('open'));assert(!w.document.querySelector('.app-shell').inert);
console.log('PASS Event editor generates, saves, reopens and preserves answers; modal focus is trapped and restored');
}finally{w.close();}
// Hosted storage: only exact owner UUID can claim legacy data.
const hosted=new JSDOM('',{url:'https://peleja.test/',runScripts:'outside-only'});const h=hosted.window;Object.defineProperty(h,'localStorage',{value:storage});h.PELEJA_BACKEND={legacyOwnerUserId:'owner'};h.eval(read('storage.js'));
assert.equal(h.PELEJA_STORAGE.scope,null);h.PELEJA_STORAGE.activateUser('wilton');assert.equal(h.PELEJA_STORAGE.getItem('medstudy_materials_v1'),null);
h.PELEJA_STORAGE.activateUser('owner');assert.match(h.PELEJA_STORAGE.getItem('medstudy_materials_v1'),/Privado/);
h.PELEJA_STORAGE.deactivate();assert.equal(h.PELEJA_STORAGE.getItem('medstudy_materials_v1'),null);h.close();
console.log('PASS Guest and first participant cannot read legacy owner data; logout clears active scope');
// Worker dispatch verifies that the API and arbitrary requests are never intercepted.
let precached;const handlers={};const context={URL,Set,Request,caches:{open:async()=>({addAll:async requests=>{precached=requests;}})},self:{location:{href:'https://site.test/peleja/sw.js',origin:'https://site.test'},addEventListener:(n,fn)=>handlers[n]=fn,skipWaiting(){},clients:{claim(){}}}};
vm.runInNewContext(read('sw.js'),context);
let installed;handlers.install({waitUntil(p){installed=p;}});await installed;
assert(precached.length>0);assert(precached.every(r=>r.cache==='reload'&&r.url.startsWith('https://site.test/peleja/')));
function intercepted(url,auth=false){let hit=false;handlers.fetch({request:{method:'GET',url,headers:{has:()=>auth}},respondWith(p){hit=true;p.catch(()=>{});}});return hit;}
assert.equal(intercepted('https://api.supabase.co/rest/v1/simulation_results'),false);
assert.equal(intercepted('https://site.test/private.json'),false);assert.equal(intercepted('https://site.test/peleja/app.js',true),false);
assert.equal(intercepted('https://site.test/peleja/app.js'),true);
console.log('PASS Cache allows only explicit public static files and excludes authenticated requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
