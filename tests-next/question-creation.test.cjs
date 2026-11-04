const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/questions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));
const opt=(text,isCorrect)=>({text,isCorrect,rationale:'Comentário de '+text});
const quiz={format:'peleja-quiz',version:1,title:'Micoses',source:'https://notebooklm.google.com/notebook/abc?authuser=1',questions:[
 {question:'<img src=x onerror="window.pwned=1">Agente da pitiríase versicolor?',answerOptions:[opt('Malassezia',true),opt('Candida',false)],hint:'Levedura lipofílica',topic:'Superficiais'},
 {question:'Tratamento da tinea capitis?',answerOptions:[opt('Griseofulvina',true),opt('Nistatina',false),opt('Clotrimazol tópico',false)],hint:'',topic:'Dermatofitoses'}]};
const materials=[{id:'mat-1',title:'D09 Micoses',subject:'Dermatologia',notebookUrl:'https://notebooklm.google.com/notebook/abc'},{id:'mat-2',title:'D10 Acne',subject:'Dermatologia'}];

function page({session=true,admin=true,hash='',bridge=null}={}){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://127.0.0.1:8765/next/questions/'+hash}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});w.TextEncoder=TextEncoder;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const calls=[],left=[],state={sets:[]};w.PELEJA_LEAVE=url=>left.push(url);
 const rpc=async(name,args)=>{calls.push([name,args]);
  if(name==='has_peleja_access')return {data:true};
  if(name==='is_peleja_admin')return {data:admin};
  if(name==='get_workspace')return {data:{payload:{preferences:{pelejaNext:{dark:true,motion:false}}},catalog:{materials}}};
  if(name==='question_sets_list')return {data:state.sets};
  if(name==='save_question_set'){if(state.sets.some(s=>s.fingerprint===args.p_fingerprint))return {error:{message:'Este conjunto já está no Peleja'}};state.sets.unshift({id:'set-'+state.sets.length,materialId:args.p_material_id,title:args.p_title,count:args.p_questions.length,fingerprint:args.p_fingerprint,createdAt:'2026-11-04T12:00:00Z'});return {data:'set-id'};}
  if(name==='delete_question_set'){state.sets=state.sets.filter(s=>s.id!==args.p_id);return {data:null};}
  throw Error('unexpected rpc '+name);};
 const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({data:{display_name:'Vinícius'}})};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:session?{user:{id:'admin'}}:null}})},rpc,from:()=>builder})};
 if(bridge)w.document.addEventListener('peleja-import-request',()=>{const token=new URLSearchParams(w.location.hash.slice(1)).get('import');w.document.dispatchEvent(new w.CustomEvent('peleja-import-delivery',{detail:JSON.stringify({token,quiz:bridge(token)})}));});
 for(const src of ['../access/config.js','quiz-format.js','questions.js'])w.eval(fs.readFileSync(path.join(root,src),'utf8'));
 return {w,calls,left,state,$:id=>w.document.getElementById(id)};
}

(async()=>{
 // Signed out: straight to the access page, keeping the hand-off token for the return trip.
 let p=page({session:false,hash:'#import=tok-1'});await tick();
 assert.deepEqual(p.left,['../access/?next='+encodeURIComponent('#questoes/import=tok-1')]);assert.equal(p.$('gate').classList.contains('entry-error'),false);p.w.close();

 // Members who are not the administrator see a notice, never the editor.
 p=page({admin:false});await tick();
 assert.equal(p.$('denied').hidden,false);assert.equal(p.$('workspace').hidden,true);assert.equal(p.$('gate').hidden,true);
 assert.equal(p.calls.some(([n])=>n==='question_sets_list'),false);p.w.close();

 // Administrator + extension hand-off: review, suggested material, filters, safe text, save, duplicate, delete.
 p=page({hash:'#import=tok-2',bridge:token=>token==='tok-2'?quiz:null});await tick(60);
 const {w,$}=p;
 assert.equal(w.document.documentElement.dataset.pelejaMotion,'off');assert.equal($('app').classList.contains('dark'),true);assert.equal($('avatar').textContent,'V');
 assert.equal($('entry').hidden,true);assert.equal($('review').hidden,false);
 assert.equal($('title').value,'Micoses');assert.equal($('material').value,'mat-1','material picked by its NotebookLM link');
 assert.equal(w.document.querySelectorAll('#questions details').length,2);
 assert.equal(w.document.querySelector('#questions img'),null,'question text never becomes markup');assert.equal(w.pwned,undefined);
 assert.equal(w.document.querySelectorAll('.option[data-correct]').length,2);
 const chips=[...w.document.querySelectorAll('#topics button')];assert.equal(chips.length,3);chips[2].click();
 assert.deepEqual([...w.document.querySelectorAll('#questions details')].map(d=>d.hidden),[true,false]);
 $('material').value='';$('save').click();await tick();assert.equal($('status').dataset.tone,'error');assert.equal(p.calls.some(([n])=>n==='save_question_set'),false);
 $('material').value='mat-1';$('title').value='  Micoses superficiais  ';$('save').click();await tick(40);
 const saved=p.calls.find(([n])=>n==='save_question_set')[1];
 assert.equal(saved.p_material_id,'mat-1');assert.equal(saved.p_title,'Micoses superficiais');assert.equal(saved.p_source_url,'https://notebooklm.google.com/notebook/abc');
 assert.equal(saved.p_questions.length,2);assert.match(saved.p_fingerprint,/^[0-9a-f]{64}$/);
 assert.equal($('review').hidden,true);assert.equal($('entry').hidden,false);assert.equal(w.location.hash,'','hand-off token cleared after saving');
 assert.equal(w.document.querySelectorAll('#sets .set').length,1);assert.match($('sets').textContent,/Dermatologia · D09 Micoses/);
 // Same quiz again (pasted): recognized as already in Peleja.
 $('paste').value=JSON.stringify(quiz);$('read').click();await tick(40);
 assert.equal($('save').disabled,true);assert.match($('status').textContent,/já está no Peleja/);
 $('discard').click();assert.equal($('review').hidden,true);
 // Broken files are explained, not imported.
 $('paste').value=JSON.stringify({...quiz,questions:[{...quiz.questions[0],answerOptions:[opt('A',true),opt('B',true)]}]});$('read').click();await tick(40);
 assert.match($('status').textContent,/gabarito ambíguo/);assert.equal($('review').hidden,true);
 // Delete with confirmation.
 w.document.querySelector('#sets .icon-button').click();assert.equal($('confirm').open,true);
 $('confirmYes').click();await tick(40);assert.equal(w.document.querySelectorAll('#sets .set').length,0);assert.equal($('confirm').open,false);
 w.close();

 // Expired hand-off tells the administrator what to do.
 p=page({hash:'#import=tok-3',bridge:()=>null});await tick(60);
 assert.match(p.$('status').textContent,/expirou/);p.w.close();

 // Access page sends #questoes back here, with the token, and nothing else.
 const access=fs.readFileSync(path.join(__dirname,'../next/access/access.js'),'utf8');
 assert.match(access,/\^#questoes\(\?:\\\/import=\(\[\\w-\]\{1,80\}\)\)\?\$/);
 console.log('PASS question creation: sign-in redirect, admin-only, extension hand-off, material by NotebookLM link, safe text, validation, save, duplicate, delete');
})().catch(e=>{console.error(e);process.exitCode=1;});
