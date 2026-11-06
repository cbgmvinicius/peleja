// "Importar questões" (administrator): reviews a NotebookLM quiz sent by the extension
// "Peleja — Extrair questões" (or its exported .json) and saves it to one catalog material.
// The material is chosen in order: discipline, then exam scope, then material.
globalThis.PELEJA_INSTALL_IMPORT=({client,allowed})=>{
 const LETTERS='ABCDEFGHIJKLMNOPQRST',EASE='cubic-bezier(.22,1,.36,1)';
 const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
 let quiz=null,fingerprint='',sets=[],received='',saving=false,handoffTimer=0,handoffAttempts=0;
 const dialog=$('importDialog'),token=()=>{const t=new URLSearchParams(location.search).get('import')||'';return /^[\w-]{1,80}$/.test(t)?t:'';};
 const message=error=>String(error?.message||error||'').replace(/^Error:\s*/,'')||'Não foi possível concluir. Tente novamente.';
 const plain=url=>{try{const u=new URL(url);u.search='';u.hash='';return u.href.replace(/\/$/,'');}catch{return '';}};
 // "Importar para": one material (discipline > exam > material) or a whole exam (discipline > exam).
 let mode='material';
 const target=()=>{
  if(mode==='exam'){const e=facultyRecords.find(x=>x.id===$('importExamPick').value);return e&&{kind:'exam',sourceId:e.sourceId,name:`Prova inteira · ${e.type} · ${e.subject}`};}
  const m=data.find(x=>x.code===$('importMaterial').value);return m&&{kind:'material',sourceId:m.sourceId,name:m.fullTitle||m.title};
 };
 const setsOf=t=>t?sets.filter(s=>t.kind==='exam'?s.examId===t.sourceId:s.materialId===t.sourceId):[];
 const nameOfSet=s=>{if(s.examId){const e=facultyRecords.find(x=>x.sourceId===s.examId);return e?`Prova inteira · ${e.type} · ${e.subject}`:'';}const m=data.find(x=>x.sourceId===s.materialId);return m?m.fullTitle||m.title:'';};
 function status(text,tone=''){$('importStatus').textContent=text||'';$('importStatus').dataset.tone=tone;}
 function clearToken(){if(!token())return;const params=new URLSearchParams(location.search);params.delete('import');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}

 // ---------- discipline > exam > material ----------
 const examLabel={next:'Próxima prova',pending:'Provas pendentes'};
 function materialsFor(subject,exam){
  if(!subject||!exam)return [];
  const codes=examLabel[exam]?new Set(globalThis.libraryExamCodes?.(exam,subject)||[]):null;
  const list=data.filter(m=>m.subject===subject&&(codes?codes.has(m.code):(m.examTypes||[]).includes(exam))).sort(compareLibrarySubjects);
  // Same sequence as the Library: when it is grouped by specialty, keep each specialty together,
  // in the order the Library shows the groups (first class date), dates inside each group.
  return $('groupSpecialty')?.checked?[...Map.groupBy(list,m=>m.specialty||'').values()].flat():list;
 }
 function fill(select,options,placeholder){select.replaceChildren(new Option(placeholder,''),...options.map(([value,text])=>new Option(text,value)));select.value='';}
 function fillSubjects(){fill($('importSubject'),[...new Set(data.map(m=>m.subject))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(s=>[s,s]),'Selecione a disciplina');}
 function fillExams(){
  const subject=$('importSubject').value,types=[...new Set(facultyRecords.filter(e=>e.subject===subject).map(e=>e.type))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  fill($('importExam'),subject?[['next',examLabel.next],['pending',examLabel.pending],...types.map(t=>[t,t])]:[],subject?'Selecione a prova':'Escolha a disciplina primeiro');
  $('importExam').disabled=!subject;
 }
 // Optional narrowing between exam and material: "Todas as especialidades" keeps the whole list.
 function fillSpecialties(){
  const exam=$('importExam').value,names=[...new Set(materialsFor($('importSubject').value,exam).map(m=>m.specialty||'').filter(Boolean))];
  fill($('importSpecialty'),names.map(s=>[s,s]),exam?'Todas as especialidades':'Escolha a prova primeiro');
  $('importSpecialty').disabled=!exam||names.length<2;
 }
 function fillMaterials(){
  const subject=$('importSubject').value,exam=$('importExam').value,specialty=$('importSpecialty').value;
  const options=materialsFor(subject,exam).filter(m=>!specialty||m.specialty===specialty).map(m=>[m.code,m.fullTitle||m.title]);
  fill($('importMaterial'),options,!exam?'Escolha a prova primeiro':options.length?'Selecione a apostila':'Nenhuma apostila nesta prova');
  $('importMaterial').disabled=!exam||!options.length;
 }
 const plural=(n,one,many)=>`${n} ${n===1?one:many}`;
 // Whole exam: the discipline's exams, upcoming first (by date), then the ones already taken.
 function fillExamPick(){
  const subject=$('importSubject').value,list=facultyRecords.filter(e=>e.subject===subject);
  const upcoming=list.filter(e=>!isFacultyPerformed(e)).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')),done=list.filter(e=>isFacultyPerformed(e)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const when=e=>e.date?' · '+new Date(e.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short'}):'';
  fill($('importExamPick'),[...upcoming,...done].map(e=>[e.id,`${e.type}${when(e)} · ${plural(e.materialCodes.length,'apostila','apostilas')}`]),!subject?'Escolha a disciplina primeiro':list.length?'Selecione a prova':'Nenhuma prova nesta disciplina');
  $('importExamPick').disabled=!subject||!list.length;
 }
 function setMode(next,animate=true){
  mode=next;const tabs=$('importTarget');tabs.style.setProperty('--tab-index',next==='exam'?1:0);
  for(const b of tabs.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.target===next));
  for(const id of ['importExam','importSpecialty','importMaterial'])$(id).closest('.editor-field').hidden=next==='exam';
  $('importExamPickField').hidden=next!=='exam';
  fillExamPick();onScopeChange();
  if(animate)motion($('importReview').querySelector('.import-scope'),[{opacity:.4,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:220,easing:EASE});
 }
 $('importTarget').onclick=event=>{const b=event.target.closest('[data-target]');if(b&&b.dataset.target!==mode){status('');setMode(b.dataset.target);}};
 $('importExamPick').onchange=()=>{status('');onScopeChange();};
 function onScopeChange(){renderSets();refreshSave();syncFilterControls();}
 // A manual choice replaces the "suggested by the NotebookLM link" note.
 $('importSubject').onchange=()=>{status('');fillExams();fillSpecialties();fillMaterials();fillExamPick();onScopeChange();};
 $('importExam').onchange=()=>{status('');fillSpecialties();fillMaterials();onScopeChange();};
 $('importSpecialty').onchange=()=>{status('');fillMaterials();onScopeChange();};
 $('importMaterial').onchange=()=>{status('');onScopeChange();};
 function suggest(source){
  fillSubjects();fillExams();fillSpecialties();fillMaterials();fillExamPick();
  const key=plain(source),m=key&&data.find(x=>plain(x.notebookUrl||'')===key);
  if(m){
   $('importSubject').value=m.subject;fillExams();
   const exam=['next','pending',...(m.examTypes||[])].find(e=>materialsFor(m.subject,e).includes(m));
   if(exam){$('importExam').value=exam;fillSpecialties();fillMaterials();$('importMaterial').value=m.code;}
   setMode('material',false);
  }
  onScopeChange();
  return m;
 }

 // ---------- saved sets of the chosen material ----------
 function renderSets(){
  const host=$('importSets'),t=target(),list=setsOf(t);
  host.replaceChildren();host.hidden=!list.length;if(!list.length)return;
  host.append(el('p',{className:'import-sets-title',textContent:`${t.kind==='exam'?'Já nesta prova':'Já nesta apostila'} · ${list.length} ${list.length===1?'conjunto':'conjuntos'}`}));
  for(const s of list){
   const remove=el('button',{type:'button',className:'icon',title:'Apagar conjunto'},el('span',{className:'sr-only',textContent:`Apagar ${s.title}`}));
   remove.insertAdjacentHTML('beforeend','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"/></svg>');
   remove.onclick=()=>confirmPeleja('Apagar conjunto?',async()=>{
    const result=await client.rpc('delete_question_set',{p_id:s.id});
    if(result.error){toast(message(result.error),'info');return;}
    toast('Conjunto apagado','info');await loadSets();
   },{description:`“${s.title}” e suas ${s.count} ${s.count===1?'questão':'questões'} saem do Peleja.`,accept:'Apagar',destructive:true});
   const edit=el('button',{type:'button',className:'icon',title:'Editar conjunto',onclick:()=>{close(true);globalThis.PELEJA_EDIT_SET?.(s.id);}},el('span',{className:'sr-only',textContent:`Editar ${s.title}`}));
   edit.insertAdjacentHTML('beforeend','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5Z"/></svg>');
   host.append(el('div',{className:'import-set'},el('span',{textContent:s.title}),el('small',{textContent:`${s.count} ${s.count===1?'questão':'questões'}`}),edit,remove));
  }
 }
 async function loadSets(){const result=await client.rpc('question_sets_list');if(result.error)throw result.error;sets=Array.isArray(result.data)?result.data:[];renderSets();refreshSave();}
 function refreshSave(){
  const dup=quiz&&sets.find(s=>s.fingerprint===fingerprint);
  $('importSave').hidden=!quiz;$('importSave').disabled=!quiz||saving||!!dup||!target();
  if(dup){const where=nameOfSet(dup);status(`Estas questões já estão no Peleja${where?`, em ${where}`:''}.`,'ok');}
 }

 // ---------- review ----------
 // Same height motion as the course modules; without motion the native <details> works alone.
 function toggle(card){
  const running=card._motion,expand=running?!running.expand:!card.open,start=card.getBoundingClientRect().height;
  running?.animation.cancel();card.open=true;card.style.overflow='hidden';
  if(expand)delete card.dataset.closing;else card.dataset.closing='';
  const end=expand?card.scrollHeight:card.querySelector('summary').getBoundingClientRect().height;
  const finish=()=>{card.open=expand;card.style.overflow='';card.style.height='';card._motion=null;delete card.dataset.closing;};
  const animation=motion(card,[{height:start+'px'},{height:end+'px'}],{duration:expand?300:240,easing:EASE});
  if(!animation){finish();return;}
  card._motion={animation,expand};animation.onfinish=finish;
  const body=card.querySelector('.import-q-body');if(expand)motion(body,[{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'none'}],{duration:300,easing:EASE});
 }
 function card(q,i){
  const options=el('ol',{className:'import-options'});
  q.answerOptions.forEach((a,j)=>{
   const text=el('p',{textContent:a.text});if(a.isCorrect)text.append(el('span',{className:'import-answer',textContent:'Correta'}));
   const li=el('li',{className:'import-option'},el('span',{className:'import-letter',textContent:LETTERS[j]}),el('div',{},text,el('p',{className:'import-why',textContent:a.rationale})));
   if(a.isCorrect)li.dataset.correct='';options.append(li);
  });
  const body=el('div',{className:'import-q-body'},options);
  if(q.hint)body.append(el('p',{className:'import-hint'},el('b',{textContent:'Dica: '}),q.hint));
  const head=el('span',{className:'import-q-text'},el('span',{textContent:q.question}));
  if(q.topic)head.append(el('span',{className:'import-tag',textContent:q.topic}));
  const summary=el('summary',{},el('span',{className:'import-num',textContent:i+1}),head,el('span',{className:'import-chevron','aria-hidden':'true'}));
  const node=el('details',{className:'import-q'},summary,body);node.dataset.topic=q.topic||'';
  summary.addEventListener('click',event=>{event.preventDefault();toggle(node);});
  return node;
 }
 function topics(){
  const counts=new Map();for(const q of quiz.questions)if(q.topic)counts.set(q.topic,(counts.get(q.topic)||0)+1);
  const host=$('importTopics');host.replaceChildren();host.hidden=counts.size<2;
  const pick=topic=>{for(const b of host.children)b.setAttribute('aria-pressed',String(b.dataset.topic===topic));for(const c of $('importQuestions').children)c.hidden=topic!==''&&c.dataset.topic!==topic;};
  const chip=(label,topic,n)=>{const b=el('button',{type:'button'},label,el('small',{textContent:n}));b.dataset.topic=topic;b.onclick=()=>pick(topic);host.append(b);};
  chip('Todos os temas','',quiz.questions.length);for(const [t,n] of counts)chip(t,t,n);pick('');
 }
 async function review(raw){
  try{
   const value=PelejaQuiz.normalize(raw),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value.questions)));
   quiz=value;fingerprint=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
   const options=quiz.questions.reduce((n,q)=>n+q.answerOptions.length,0),topicCount=new Set(quiz.questions.map(q=>q.topic).filter(Boolean)).size;
   $('importSummary').replaceChildren(`${quiz.questions.length} ${quiz.questions.length===1?'questão':'questões'} · ${options} alternativas${topicCount?` · ${topicCount} ${topicCount===1?'tema':'temas'}`:''} · todas com gabarito e comentário`);
   $('importSetTitle').value=quiz.title||'';$('importQuestions').replaceChildren(...quiz.questions.map(card));topics();
   $('importEntry').hidden=true;$('importReview').hidden=false;
   const m=suggest(quiz.source);
   status(m?'Apostila escolhida pelo link do NotebookLM cadastrado nela. Confira antes de importar.':'Escolha a disciplina, a prova e a apostila.', 'ok');
   refreshSave();
   motion($('importReview'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:260,easing:EASE});
  }catch(error){quiz=null;$('importReview').hidden=true;$('importEntry').hidden=false;status(message(error),'error');refreshSave();}
 }
 function resetView(){
  quiz=null;fingerprint='';received='';saving=false;clearTimeout(handoffTimer);
  $('importEntry').hidden=false;$('importReview').hidden=true;$('importQuestions').replaceChildren();$('importSets').hidden=true;status('');refreshSave();
 }

 // ---------- open / close ----------
 function open(){
  if(!allowed())return;closeMenus?.();resetView();fillSubjects();fillExams();fillSpecialties();fillMaterials();setMode('material',false);syncFilterControls();
  if(!dialog.open)dialog.showModal();$('importClose').focus();
  motion(dialog.querySelector('.import-body'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.25,.1,.25,1)'});
  loadSets().catch(error=>status(message(error),'error'));
 }
 function close(force=false){
  if(!force&&quiz&&!saving){confirmPeleja('Descartar estas questões?',()=>close(true),{description:'Elas não foram importadas. Para trazê-las de novo, use a extensão.'});return;}
  clearTimeout(handoffTimer);clearToken();dialog.close();resetView();$('new')?.focus();
 }
 $('importClose').onclick=()=>close();$('importCancel').onclick=()=>close();
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});

 // ---------- save ----------
 $('importSave').onclick=async()=>{
  const t=target();if(!quiz||!t||saving)return;
  saving=true;refreshSave();$('importSave').setAttribute('aria-busy','true');status('Importando…','busy');
  try{
   const common={p_title:$('importSetTitle').value.trim().slice(0,200)||quiz.title.trim()||'Questões do NotebookLM',p_source_url:quiz.source||'',p_questions:quiz.questions,p_fingerprint:fingerprint};
   const result=t.kind==='exam'?await client.rpc('save_exam_question_set',{p_exam_id:t.sourceId,...common}):await client.rpc('save_question_set',{p_material_id:t.sourceId,...common});
   if(result.error)throw result.error;
   const count=quiz.questions.length;saving=false;close(true);
   toast(`${count} ${count===1?'questão importada':'questões importadas'} em ${t.name}`,'info');
   loadSets().catch(()=>{});globalThis.PELEJA_REFRESH_SOLVER?.();
  }catch(error){status(message(error),'error');}
  finally{saving=false;$('importSave').removeAttribute('aria-busy');refreshSave();}
 };

 // ---------- exported file ----------
 async function readFile(file){
  if(!file)return;if(file.size>PelejaQuiz.MAX){status('Arquivo grande demais. O limite é 8 MB.','error');return;}
  try{await review(JSON.parse(await file.text()));}catch{status('Este arquivo não é um JSON válido. Exporte de novo pela extensão.','error');}
 }
 $('importFile').onchange=event=>{readFile(event.target.files[0]);event.target.value='';};
 const drop=$('importDrop');
 for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('over');});
 for(const type of ['dragleave','drop'])drop.addEventListener(type,()=>drop.classList.remove('over'));
 drop.addEventListener('drop',e=>{e.preventDefault();readFile(e.dataTransfer?.files?.[0]);});

 // ---------- extension hand-off (same string-event protocol as the extension's bridge.js) ----------
 document.addEventListener('peleja-import-delivery',event=>{
  if(typeof event.detail!=='string'||event.detail.length>PelejaQuiz.MAX+1000)return;
  let delivery;try{delivery=JSON.parse(event.detail);}catch{return;}
  const t=token();if(!t||delivery.token!==t||received===t||!dialog.open)return;
  if(!delivery.quiz){$('importEntry').hidden=false;status('O envio expirou. Na aba do quiz, clique em Adicionar ao Peleja de novo.','error');return;}
  received=t;clearTimeout(handoffTimer);review(delivery.quiz);
 });
 function requestHandoff(){
  clearTimeout(handoffTimer);const t=token();if(!t||received===t||!dialog.open)return;
  $('importEntry').hidden=true;status('Recebendo questões da extensão…','busy');
  document.dispatchEvent(new CustomEvent('peleja-import-request'));
  if(received===t)return;
  if(++handoffAttempts<30)handoffTimer=setTimeout(requestHandoff,500);
  else{$('importEntry').hidden=false;status('A extensão não entregou as questões. Confira se ela está ativa e clique em Adicionar ao Peleja de novo.','error');}
 }

 globalThis.PELEJA_OPEN_IMPORT=open;
 return {
  // Called after each successful load: shows the menu entry and answers a pending hand-off.
  ready(){
   document.querySelector('[data-create=import]').hidden=!allowed();
   if(!token())return;
   if(!allowed()){clearToken();toast('Só o administrador importa questões.','info');return;}
   if(!dialog.open){open();handoffAttempts=0;requestHandoff();}
  },
  reset(){document.querySelector('[data-create=import]').hidden=true;sets=[];if(dialog.open){dialog.close();resetView();}}
 };
};
