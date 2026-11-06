const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000;

async function app(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=Date.parse('2026-11-05T12:00:00Z');w.PELEJA_NOW=()=>clock;
 // Audio stub: records every sound created, its volume and whether it is playing.
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;this.loop=false;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[],simulations:[],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[]}};
 const saved=[],calls=[];let failSave=false;
 const opt=(text,isCorrect)=>({text,isCorrect,rationale:'Porque '+text});
 const db={set:{id:'set-1',title:'Micoses',questions:[{question:'Agente?',answerOptions:[opt('Malassezia',true),opt('Candida',false)],hint:'',topic:''}]},queue:[]};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine'||name==='pomodoro_blocks_mine')return {data:[]};
  calls.push([name,args]);
  if(name==='question_sets_list')return {data:[{id:'set-1',materialId:'m',title:db.set.title,count:1,fingerprint:'f',createdAt:'2026-11-01T00:00:00Z'}]};
  if(name==='question_set')return {data:structuredClone(db.set)};
  if(name==='question_suggestion_submit'){db.queue.push({id:'sg-'+db.queue.length,setId:args.p_set,setTitle:db.set.title,index:args.p_index,question:db.set.questions[args.p_index],kind:args.p_kind,note:args.p_note,status:'pending',createdAt:'2026-11-06T10:00:00Z',author:'Ulisses'});return {data:'sg'};}
  if(name==='question_suggestions_review_list')return {data:structuredClone(db.queue.filter(x=>!args.p_status||x.status===args.p_status))};
  if(name==='question_suggestion_review'){const x=db.queue.find(q=>q.id===args.p_id);x.status=args.p_accept?'accepted':'rejected';return {data:null};}
  if(name==='question_set_update'){db.set={...db.set,title:args.p_title,questions:args.p_questions};return {data:null};}
  if(name==='pomodoro_block_save'){if(failSave)throw Error('offline');saved.push(args);return {data:null};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Admin',role:'admin'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {db,calls,w,$:id=>w.document.getElementById(id),sounds,saved,setFail:v=>{failSave=v;},advance:ms=>{clock+=ms;},now:()=>clock};
}


(async()=>{
 const p=await app(),{w,$,db,calls}=p;const tickq=()=>new Promise(r=>setTimeout(r,60));
 // Member side: suggest a change (kind required, note up to 500).
 w.PELEJA_SUGGEST('set-1',0,'Micoses · Questão 1');assert.equal($('qrDialog').open,true);
 assert.equal($('qrSend').disabled,true);
 $('qrDialog').querySelector('[data-kind=answer]').click();assert.equal($('qrSend').disabled,true,'needs the explanation too');
 $('qrNote').value='Gabarito certo é Candida.';$('qrNote').dispatchEvent(new w.Event('input'));assert.equal($('qrSend').disabled,false);
 assert.equal($('qrNote').maxLength,500);assert.match($('qrDialog').textContent,/25[/]500/);
 $('qrSend').click();await tickq();
 assert.equal($('qrDialog').open,false);const sent=calls.find(c=>c[0]==='question_suggestion_submit')[1];assert.deepEqual([sent.p_set,sent.p_index,sent.p_kind,sent.p_note],['set-1',0,'answer','Gabarito certo é Candida.']);
 // Admin side: the menu entry shows the count; the queue lists it; opening the question edits it in place.
 const entry=w.document.querySelector('[data-create=suggestions]');await w.PELEJA_EDIT_SET&&tickq();
 assert.equal(entry.hidden,false,'admin sees the entry');
 entry.click();await tickq();assert.match($('qrDialog').textContent,/Gabarito errado/);assert.match($('qrDialog').textContent,/Ulisses/);assert.match($('qrDialog').textContent,/Micoses · Questão 1/);
 [...$('qrDialog').querySelectorAll('button')].find(b=>b.textContent==='Abrir questão').click();await tickq();await tickq();
 assert.equal($('qrSetTitle').value,'Micoses');const q=$('qrDialog').querySelector('.qr-question');assert.equal(q.open,true);assert.ok(q.querySelector('.qr-review'),'the suggestion shows on the question');
 // Fix: the right answer is B now, title changes; "Salvar e aceitar" saves then accepts.
 q.querySelectorAll('input[type=radio]')[1].checked=true;$('qrSetTitle').value='Micoses (revisado)';
 [...q.querySelectorAll('button')].find(b=>b.textContent==='Salvar e aceitar').click();await tickq();
 assert.equal(db.set.title,'Micoses (revisado)');assert.equal(db.set.questions[0].answerOptions[1].isCorrect,true);assert.equal(db.set.questions[0].answerOptions[0].isCorrect,false);
 assert.equal(db.queue[0].status,'accepted');
 // Empty fields are refused before reaching the server.
 w.PELEJA_EDIT_SET('set-1');await tickq();await tickq();
 const stem=$('qrDialog').querySelector('.qr-question textarea');stem.value='  ';$('qrSave').click();await tickq();
 assert.match($('qrDialog').textContent,/não podem ficar vazios/);assert.equal(calls.filter(c=>c[0]==='question_set_update').length,1);
 console.log('PASS question review: member suggestion (kind + 500-char note), admin entry and queue, edit in place with save-and-accept, empty fields refused');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
