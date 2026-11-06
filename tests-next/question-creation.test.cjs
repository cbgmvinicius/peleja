const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));
const opt=(text,isCorrect)=>({text,isCorrect,rationale:'Comentário de '+text});
const quiz={format:'peleja-quiz',version:1,title:'Micoses',source:'https://notebooklm.google.com/notebook/abc?authuser=1',questions:[
 {question:'<img src=x onerror="window.pwned=1">Agente da pitiríase versicolor?',answerOptions:[opt('Malassezia',true),opt('Candida',false)],hint:'Levedura lipofílica',topic:'Superficiais'},
 {question:'Tratamento da tinea capitis?',answerOptions:[opt('Griseofulvina',true),opt('Nistatina',false),opt('Clotrimazol tópico',false)],hint:'',topic:'Dermatofitoses'}]};

async function app({role='admin',search='',delivery=null}={}){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/'+search+'#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[
  {id:'derm:1',title:'D09 Micoses',subject:'Dermatologia',specialty:'Pele',classDate:'2026-10-10',notebookUrl:'https://notebooklm.google.com/notebook/abc'},
  {id:'derm:2',title:'D10 Acne',subject:'Dermatologia',classDate:'2026-10-11'},
  {id:'derm:3',title:'N12 Neurodivergências',subject:'Dermatologia',specialty:'Neurologia',classDate:'2026-10-16'},
  {id:'derm:4',title:'D11 Manifestações',subject:'Dermatologia',specialty:'Pele',classDate:'2026-10-28'},
  {id:'ped:1',title:'P03 Asma',subject:'Pediatria',classDate:'2026-10-12'}],simulations:[],exams:[
  {id:'e1',subject:'Dermatologia',type:'PR2.1',date:'2099-12-31',materialIds:['derm:4','derm:3','derm:1']},
  {id:'e2',subject:'Dermatologia',type:'PR1.1',date:'2098-01-10',materialIds:['derm:2']},
  {id:'e3',subject:'Pediatria',type:'PR1.1',date:'2098-01-10',materialIds:['ped:1']}]},
  payload:{materials:[],exams:[],simulations:[],courses:[],questionSessions:[]}};
 const calls=[],state={sets:[]};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'test'}}),signOut:async()=>({})},rpc:async(name,args)=>{calls.push([name,args]);
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list')return {data:state.sets};
  if(name==='save_question_set'){if(state.sets.some(s=>s.fingerprint===args.p_fingerprint))return {error:{message:'Este conjunto já está no Peleja'}};state.sets.unshift({id:'set-'+state.sets.length,materialId:args.p_material_id,title:args.p_title,count:args.p_questions.length,fingerprint:args.p_fingerprint,createdAt:'2026-11-04T12:00:00Z'});return {data:'id'};}
  if(name==='save_exam_question_set'){if(state.sets.some(s=>s.fingerprint===args.p_fingerprint))return {error:{message:'Este conjunto já está no Peleja'}};state.sets.unshift({id:'set-'+state.sets.length,examId:args.p_exam_id,title:args.p_title,count:args.p_questions.length,fingerprint:args.p_fingerprint,createdAt:'2026-11-04T12:00:00Z'});return {data:'id'};}
  if(name==='delete_question_set'){state.sets=state.sets.filter(s=>s.id!==args.p_id);return {data:null};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Tester',role}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 if(delivery)w.document.addEventListener('peleja-import-request',()=>{const t=new URL(w.location.href).searchParams.get('import');w.document.dispatchEvent(new w.CustomEvent('peleja-import-delivery',{detail:JSON.stringify({token:t,quiz:delivery(t)})}));});
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(250);
 return {w,calls,state,$:id=>w.document.getElementById(id),opts:id=>[...w.document.getElementById(id).options].map(o=>o.textContent)};
}

(async()=>{
 // Members: no menu entry, and a hand-off link only explains itself.
 let p=await app({role:'participant',search:'?import=tok-0'});
 assert.equal(p.w.document.querySelector('[data-create=import]').hidden,true);assert.equal(p.$('importDialog').open,false);
 assert.equal(new URL(p.w.location.href).searchParams.get('import'),null,'token removed');p.w.close();

 // Administrator from the extension: the menu opens over the app with the quiz.
 p=await app({search:'?import=tok-1',delivery:t=>t==='tok-1'?quiz:null});await tick(80);
 const {w,$,opts,calls}=p;
 assert.equal(w.document.querySelector('[data-create=import]').hidden,false);
 assert.equal($('importDialog').open,true);assert.equal($('importEntry').hidden,true);assert.equal($('importReview').hidden,false);
 assert.equal(w.document.querySelectorAll('#importQuestions details').length,2);
 assert.equal(w.document.querySelector('#importQuestions img'),null,'question text never becomes markup');assert.equal(w.pwned,undefined);
 assert.equal(w.document.getElementById('importTitle').textContent,'Importar questões');assert.equal(w.document.getElementById('importSetTitle').value,'Micoses','title comes from the extension and can be edited');w.document.getElementById('importSetTitle').value='  Micoses  ';
 // Suggested by the NotebookLM link, following the discipline > exam > material order.
 assert.equal($('importSubject').value,'Dermatologia');assert.equal($('importExam').value,'pending');assert.equal($('importMaterial').selectedOptions[0].textContent,'D09 Micoses');
 assert.deepEqual(opts('importExam'),['Selecione a prova','Próxima prova','Provas pendentes','PR1.1','PR2.1']);
 // Changing the discipline clears and locks the later steps.
 $('importSubject').value='Pediatria';$('importSubject').dispatchEvent(new w.Event('change'));
 assert.equal($('importExam').value,'');assert.equal($('importExam').disabled,false);assert.equal($('importMaterial').disabled,true);assert.equal($('importSpecialty').disabled,true);assert.equal($('importSave').disabled,true);
 $('importSubject').value='';$('importSubject').dispatchEvent(new w.Event('change'));assert.equal($('importExam').disabled,true);
 $('importSubject').value='Dermatologia';$('importSubject').dispatchEvent(new w.Event('change'));
 $('importExam').value='next';$('importExam').dispatchEvent(new w.Event('change'));
 assert.deepEqual(opts('importMaterial'),['Selecione a apostila','D10 Acne'],'next exam is PR1.1 (2098)');
 $('importExam').value='PR2.1';$('importExam').dispatchEvent(new w.Event('change'));
 // Same sequence as the Library: by class date, or kept together by specialty when the Library is grouped.
 assert.deepEqual(opts('importMaterial'),['Selecione a apostila','D09 Micoses','N12 Neurodivergências','D11 Manifestações']);assert.equal($('importSave').disabled,true);
 $('groupSpecialty').checked=true;$('importExam').dispatchEvent(new w.Event('change'));
 assert.deepEqual(opts('importMaterial'),['Selecione a apostila','D09 Micoses','D11 Manifestações','N12 Neurodivergências']);
 // Optional specialty filter between exam and material.
 assert.deepEqual(opts('importSpecialty'),['Todas as especialidades','Pele','Neurologia']);assert.equal($('importSpecialty').disabled,false);
 $('importSpecialty').value='Neurologia';$('importSpecialty').dispatchEvent(new w.Event('change'));
 assert.deepEqual(opts('importMaterial'),['Selecione a apostila','N12 Neurodivergências']);
 $('importSpecialty').value='';$('importSpecialty').dispatchEvent(new w.Event('change'));
 assert.equal(w.document.getElementById('importMaterial').options.length,4);
 $('importMaterial').value=[...$('importMaterial').options].find(o=>o.textContent==='D09 Micoses').value;$('importMaterial').dispatchEvent(new w.Event('change'));assert.equal($('importSave').disabled,false);
 // Topic filter.
 const chips=[...w.document.querySelectorAll('#importTopics button')];assert.equal(chips.length,3);chips[2].click();
 assert.deepEqual([...w.document.querySelectorAll('#importQuestions details')].map(d=>d.hidden),[true,false]);
 // Expand / collapse keeps working without animation support.
 const first=w.document.querySelector('#importQuestions summary');first.click();assert.equal(first.parentElement.open,true);first.click();assert.equal(first.parentElement.open,false);
 // Save: catalog id, quiz title, clean source.
 $('importSave').click();await tick(60);
 const saved=calls.find(([n])=>n==='save_question_set')[1];
 assert.equal(saved.p_material_id,'derm:1');assert.equal(saved.p_title,'Micoses');assert.equal(saved.p_source_url,'https://notebooklm.google.com/notebook/abc');assert.match(saved.p_fingerprint,/^[0-9a-f]{64}$/);
 assert.equal($('importDialog').open,false);assert.equal(new URL(w.location.href).searchParams.get('import'),null);assert.equal(w.location.hash,'#biblioteca','page kept');
 // From the + menu with the exported file content: duplicate recognized, sets listed with delete.
 w.document.querySelector('[data-create=import]').click();await tick(60);
 assert.equal($('importDialog').open,true);assert.equal($('importEntry').hidden,false);assert.equal($('importExam').disabled,true);
 assert.equal(w.document.querySelector('#importDialog textarea'),null,'no paste box');
 const dropFile=value=>{const e=new w.Event('drop',{bubbles:true,cancelable:true});e.dataTransfer={files:[new w.File([JSON.stringify(value)],'peleja-questoes.json',{type:'application/json'})]};$('importDrop').dispatchEvent(e);};
 dropFile(quiz);await tick(80);
 assert.equal($('importSave').disabled,true);assert.match($('importStatus').textContent,/já estão no Peleja/);
 assert.equal(w.document.querySelectorAll('#importSets .import-set').length,1);
 // Broken content is explained.
 $('importClose').click();await tick(20);if(w.document.getElementById('confirmAccept'))w.document.getElementById('confirmAccept').click();await tick(20);
 w.document.querySelector('[data-create=import]').click();await tick(60);
 dropFile({...quiz,questions:[{...quiz.questions[0],answerOptions:[opt('A',true),opt('B',true)]}]});await tick(80);
 assert.match($('importStatus').textContent,/gabarito ambíguo/);assert.equal($('importReview').hidden,true);
 w.close();

 // Whole exam ("tudo em um"): imported to the exam, not to a material.
 p=await app();{const {w,$,calls}=p;
 w.document.querySelector('[data-create=import]').click();await tick(60);
 const e=new w.Event('drop',{bubbles:true,cancelable:true});e.dataTransfer={files:[new w.File([JSON.stringify({...quiz,title:'PR2.1 tudo em um',source:''})],'q.json',{type:'application/json'})]};$('importDrop').dispatchEvent(e);await tick(80);
 $('importSubject').value='Dermatologia';$('importSubject').dispatchEvent(new w.Event('change'));
 assert.equal($('importExamPickField').hidden,true,'apostila mode by default');
 w.document.querySelector('#importTarget [data-target=exam]').click();await tick();
 assert.equal($('importExamPickField').hidden,false);assert.equal($('importMaterial').closest('.editor-field').hidden,true);assert.equal($('importExam').closest('.editor-field').hidden,true);
 assert.equal($('importSave').disabled,true);
 const examOptions=[...$('importExamPick').options].map(o=>o.textContent);assert.equal(examOptions.length,3);assert.match(examOptions[1],/^PR1.1 · 10 de jan. · 1 apostila$/,'upcoming first, by date');assert.match(examOptions[2],/^PR2.1 · 31 de dez. · 3 apostilas$/);
 $('importExamPick').value=$('importExamPick').options[2].value;$('importExamPick').dispatchEvent(new w.Event('change'));
 assert.equal($('importSave').disabled,false);$('importSave').click();await tick(60);
 const saved=calls.find(([n])=>n==='save_exam_question_set')[1];assert.equal(saved.p_exam_id,'e1');assert.equal(saved.p_title,'PR2.1 tudo em um');
 assert.equal(calls.some(([n])=>n==='save_question_set'),false);assert.equal($('importDialog').open,false);w.close();}
 // Expired hand-off.
 p=await app({search:'?import=tok-2',delivery:()=>null});await tick(80);
 assert.match(p.$('importStatus').textContent,/expirou/);p.w.close();

 // Signed-out visitors keep the hand-off through the access page.
 const access=fs.readFileSync(path.join(__dirname,'../next/access/access.js'),'utf8'),connected=fs.readFileSync(path.join(root,'connected.js'),'utf8');
 assert.match(access,/destination\.search='\?import='\+questions\[1\]/);assert.match(connected,/'#questoes\/import='\+token/);
 console.log('PASS import menu: admin-only entry, extension hand-off, discipline > exam > material, NotebookLM suggestion, safe text, topics, save, duplicate, validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
