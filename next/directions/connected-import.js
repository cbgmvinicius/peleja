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
 const material=()=>data.find(m=>m.code===$('importMaterial').value);
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
 function fillMaterials(){
  const exam=$('importExam').value,list=materialsFor($('importSubject').value,exam);
  fill($('importMaterial'),list.map(m=>[m.code,m.fullTitle||m.title]),!exam?'Escolha a prova primeiro':list.length?'Selecione a apostila':'Nenhuma apostila nesta prova');
  $('importMaterial').disabled=!exam||!list.length;
 }
 function onScopeChange(){renderSets();refreshSave();syncFilterControls();}
 // A manual choice replaces the "suggested by the NotebookLM link" note.
 $('importSubject').onchange=()=>{status('');fillExams();fillMaterials();onScopeChange();};
 $('importExam').onchange=()=>{status('');fillMaterials();onScopeChange();};
 $('importMaterial').onchange=()=>{status('');onScopeChange();};
 function suggest(source){
  fillSubjects();fillExams();fillMaterials();
  const key=plain(source),m=key&&data.find(x=>plain(x.notebookUrl||'')===key);
  if(m){
   $('importSubject').value=m.subject;fillExams();
   const exam=['next','pending',...(m.examTypes||[])].find(e=>materialsFor(m.subject,e).includes(m));
   if(exam){$('importExam').value=exam;fillMaterials();$('importMaterial').value=m.code;}
  }
  onScopeChange();
  return m;
 }

 // ---------- saved sets of the chosen material ----------
 function renderSets(){
  const host=$('importSets'),m=material(),list=m?sets.filter(s=>s.materialId===m.sourceId):[];
  host.replaceChildren();host.hidden=!list.length;if(!list.length)return;
  host.append(el('p',{className:'import-sets-title',textContent:`Já nesta apostila · ${list.length} ${list.length===1?'conjunto':'conjuntos'}`}));
  for(const s of list){
   const remove=el('button',{type:'button',className:'icon',title:'Apagar conjunto'},el('span',{className:'sr-only',textContent:`Apagar ${s.title}`}));
   remove.insertAdjacentHTML('beforeend','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"/></svg>');
   remove.onclick=()=>confirmPeleja('Apagar conjunto?',async()=>{
    const result=await client.rpc('delete_question_set',{p_id:s.id});
    if(result.error){toast(message(result.error),'info');return;}
    toast('Conjunto apagado','info');await loadSets();
   },{description:`“${s.title}” e suas ${s.count} ${s.count===1?'questão':'questões'} saem do Peleja.`,accept:'Apagar',destructive:true});
   host.append(el('div',{className:'import-set'},el('span',{textContent:s.title}),el('small',{textContent:`${s.count} ${s.count===1?'questão':'questões'}`}),remove));
  }
 }
 async function loadSets(){const result=await client.rpc('question_sets_list');if(result.error)throw result.error;sets=Array.isArray(result.data)?result.data:[];renderSets();refreshSave();}
 function refreshSave(){
  const dup=quiz&&sets.find(s=>s.fingerprint===fingerprint);
  $('importSave').hidden=!quiz;$('importSave').disabled=!quiz||saving||!!dup||!material();
  if(dup){const m=data.find(x=>x.sourceId===dup.materialId);status(`Estas questões já estão no Peleja${m?`, em ${m.fullTitle||m.title}`:''}.`,'ok');}
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
   $('importSummary').replaceChildren(el('strong',{textContent:quiz.title}),el('br'),`${quiz.questions.length} ${quiz.questions.length===1?'questão':'questões'} · ${options} alternativas${topicCount?` · ${topicCount} ${topicCount===1?'tema':'temas'}`:''} · todas com gabarito e comentário`);
   $('importQuestions').replaceChildren(...quiz.questions.map(card));topics();
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
  if(!allowed())return;closeMenus?.();resetView();fillSubjects();fillExams();fillMaterials();syncFilterControls();
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
  const m=material();if(!quiz||!m||saving)return;
  saving=true;refreshSave();$('importSave').setAttribute('aria-busy','true');status('Importando…','busy');
  try{
   const result=await client.rpc('save_question_set',{p_material_id:m.sourceId,p_title:quiz.title.trim()||'Questões do NotebookLM',p_source_url:quiz.source||'',p_questions:quiz.questions,p_fingerprint:fingerprint});
   if(result.error)throw result.error;
   const count=quiz.questions.length;saving=false;close(true);
   toast(`${count} ${count===1?'questão importada':'questões importadas'} em ${m.fullTitle||m.title}`,'info');
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
