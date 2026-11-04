// "Criar questões": the administrator reviews a NotebookLM quiz (sent by the extension or loaded
// from its exported file), picks the catalog material it belongs to and saves it to Supabase.
(async()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
 const LETTERS='ABCDEFGHIJKLMNOPQRST';
 const leave=url=>(globalThis.PELEJA_LEAVE||(target=>location.replace(target)))(url);
 let client=null,materials=[],sets=[],current=null,fingerprint='',received='',saving=false;

 const importToken=()=>new URLSearchParams(location.hash.slice(1)).get('import')||'';
 const accessUrl=()=>'../access/?next='+encodeURIComponent('#questoes'+(importToken()?'/import='+importToken():''));
 function ready(){$('gate').hidden=true;document.body.classList.remove('entry-busy');}
 function fail(text){
  const gate=$('gate');gate.hidden=false;gate.classList.add('entry-error');gate.querySelector('p').textContent=text;
  gate.querySelector('a')?.remove();gate.append(el('a',{href:accessUrl(),textContent:'Ir para o acesso'}));
 }
 function status(text,tone=''){$('status').textContent=text||'';$('status').dataset.tone=tone;}
 let toastTimer=0;
 function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);}
 function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Falha ao carregar conexão'));document.head.append(s);});}
 const plain=url=>{try{const u=new URL(url);u.search='';u.hash='';return u.href.replace(/\/$/,'');}catch{return '';}};
 const materialName=m=>m?`${m.subject?m.subject+' · ':''}${m.title}`:'Apostila removida do catálogo';
 const message=error=>String(error?.message||error||'').replace(/^Error:\s*/,'')||'Não foi possível concluir. Tente novamente.';

 // ---------- review ----------
 function questionCard(q,i){
  const head=el('div',{className:'qtext'},el('span',{textContent:q.question}));
  if(q.topic)head.append(el('span',{className:'tag',textContent:q.topic}));
  const options=el('ol',{className:'options'});
  q.answerOptions.forEach((a,j)=>{
   const text=el('p',{textContent:a.text});if(a.isCorrect)text.append(el('span',{className:'answer',textContent:'Correta'}));
   const li=el('li',{className:'option'},el('span',{className:'letter',textContent:LETTERS[j]}),el('div',{},text,el('p',{className:'why',textContent:a.rationale})));
   if(a.isCorrect)li.dataset.correct='';
   options.append(li);
  });
  const body=el('div',{className:'q-body'},options);
  if(q.hint)body.append(el('p',{className:'hint'},el('b',{textContent:'Dica: '}),q.hint));
  const card=el('details',{className:'q'},el('summary',{},el('span',{className:'num',textContent:i+1}),head),body);
  card.dataset.topic=q.topic||'';
  return card;
 }
 function topicChips(quiz){
  const counts=new Map();for(const q of quiz.questions)if(q.topic)counts.set(q.topic,(counts.get(q.topic)||0)+1);
  const host=$('topics');host.replaceChildren();host.hidden=counts.size<2;
  const pick=topic=>{
   for(const b of host.children)b.setAttribute('aria-pressed',String(b.dataset.topic===topic));
   for(const card of $('questions').children)card.hidden=topic!==''&&card.dataset.topic!==topic;
  };
  const chip=(label,topic,n)=>{const b=el('button',{type:'button'},label,el('small',{textContent:n}));b.dataset.topic=topic;b.onclick=()=>pick(topic);host.append(b);};
  chip('Todos os temas','',quiz.questions.length);
  for(const [topic,n] of counts)chip(topic,topic,n);
  pick('');
 }
 function suggestMaterial(source){
  const key=plain(source),match=key&&materials.find(m=>plain(m.notebookUrl||'')===key);
  $('material').value=match?match.id:'';
  $('materialHint').textContent=match?'Escolhida pelo link do NotebookLM cadastrado na apostila.':source?'Nenhuma apostila tem este link do NotebookLM. Escolha a apostila.':'';
 }
 function duplicate(){return sets.find(s=>s.fingerprint===fingerprint);}
 function refreshSaveState(){
  const dup=current&&duplicate();
  $('save').disabled=!current||saving||!!dup;
  if(dup)status(`Este conjunto já está no Peleja, em ${materialName(materials.find(m=>m.id===dup.materialId))}.`,'ok');
 }
 async function review(raw){
  try{
   const quiz=PelejaQuiz.normalize(raw);
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(quiz.questions)));
   current=quiz;fingerprint=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
   $('title').value=quiz.title;suggestMaterial(quiz.source);
   const options=quiz.questions.reduce((n,q)=>n+q.answerOptions.length,0),topics=new Set(quiz.questions.map(q=>q.topic).filter(Boolean)).size;
   $('summary').replaceChildren(el('strong',{textContent:`${quiz.questions.length} ${quiz.questions.length===1?'questão':'questões'}`}),`, ${options} alternativas${topics?` e ${topics} ${topics===1?'tema':'temas'}`:''}. Todas com gabarito e comentário.`);
   $('questions').replaceChildren(...quiz.questions.map(questionCard));
   topicChips(quiz);
   $('entry').hidden=true;$('review').hidden=false;
   status('Questões recebidas. Confira o título e a apostila antes de salvar.','ok');
   refreshSaveState();
  }catch(error){current=null;$('review').hidden=true;$('entry').hidden=false;status(message(error),'error');}
 }
 function closeReview(){
  current=null;fingerprint='';$('review').hidden=true;$('entry').hidden=false;$('questions').replaceChildren();$('paste').value='';
  if(importToken())history.replaceState(null,'',location.pathname+location.search);
 }

 // ---------- saved sets ----------
 function renderSets(){
  const host=$('sets');host.replaceChildren();
  $('setsCount').textContent=sets.length?`${sets.length} ${sets.length===1?'conjunto':'conjuntos'}`:'';
  if(!sets.length){host.append(el('p',{className:'empty',textContent:'Nenhum conjunto ainda. Os conjuntos salvos aparecem aqui.'}));return;}
  for(const s of sets){
   const when=new Date(s.createdAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
   const remove=el('button',{type:'button',className:'icon-button',title:'Apagar conjunto'},el('span',{className:'sr-only',textContent:`Apagar ${s.title}`}));
   remove.insertAdjacentHTML('beforeend','<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"/></svg>');
   remove.onclick=()=>confirmDelete(s);
   host.append(el('div',{className:'set'},
    el('div',{className:'set-info'},el('strong',{textContent:s.title}),el('small',{textContent:`${materialName(materials.find(m=>m.id===s.materialId))} · ${when}`})),
    el('div',{className:'count'},el('b',{textContent:s.count}),el('span',{textContent:s.count===1?'questão':'questões'})),
    remove));
  }
 }
 async function loadSets(){
  const result=await client.rpc('question_sets_list');if(result.error)throw result.error;
  sets=Array.isArray(result.data)?result.data:[];renderSets();refreshSaveState();
 }
 function confirmDelete(set){
  const dialog=$('confirm');
  $('confirmTitle').textContent='Apagar conjunto?';
  $('confirmText').textContent=`“${set.title}” e suas ${set.count} ${set.count===1?'questão':'questões'} saem do Peleja. Isso não pode ser desfeito.`;
  $('confirmNo').onclick=()=>dialog.close();
  $('confirmYes').onclick=async()=>{
   $('confirmYes').disabled=true;
   try{const result=await client.rpc('delete_question_set',{p_id:set.id});if(result.error)throw result.error;dialog.close();toast('Conjunto apagado');await loadSets();}
   catch(error){dialog.close();toast(message(error));}
   finally{$('confirmYes').disabled=false;}
  };
  dialog.showModal();
 }

 // ---------- save ----------
 async function save(){
  if(!current||saving)return;
  const title=$('title').value.trim(),materialId=$('material').value;
  if(!title){$('title').focus();status('Dê um título ao conjunto.','error');return;}
  if(!materialId){$('material').focus();status('Escolha a apostila do conjunto.','error');return;}
  saving=true;refreshSaveState();$('save').setAttribute('aria-busy','true');status('Salvando no Peleja…','busy');
  try{
   const result=await client.rpc('save_question_set',{p_material_id:materialId,p_title:title,p_source_url:current.source||'',p_questions:current.questions,p_fingerprint:fingerprint});
   if(result.error)throw result.error;
   const count=current.questions.length;closeReview();
   status(`${count} ${count===1?'questão salva':'questões salvas'} em ${materialName(materials.find(m=>m.id===materialId))}.`,'ok');toast('Conjunto salvo no Peleja');
   await loadSets();
  }catch(error){status(message(error),'error');}
  finally{saving=false;$('save').removeAttribute('aria-busy');refreshSaveState();}
 }

 // ---------- inputs ----------
 async function readFile(file){
  if(!file)return;
  if(file.size>PelejaQuiz.MAX){status('Arquivo grande demais. O limite é 8 MB.','error');return;}
  try{await review(JSON.parse(await file.text()));}catch{status('Este arquivo não é um JSON válido. Exporte de novo pela extensão.','error');}
 }
 function wireInputs(){
  $('file').onchange=event=>{readFile(event.target.files[0]);event.target.value='';};
  const drop=$('drop');
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('over');});
  for(const type of ['dragleave','drop'])drop.addEventListener(type,()=>drop.classList.remove('over'));
  drop.addEventListener('drop',e=>{e.preventDefault();readFile(e.dataTransfer?.files?.[0]);});
  $('read').onclick=()=>{try{review(JSON.parse($('paste').value));}catch{status('O conteúdo colado não é um JSON válido.','error');}};
  $('save').onclick=save;
  $('discard').onclick=()=>{closeReview();status('');};
  addEventListener('beforeunload',e=>{if(current&&!saving){e.preventDefault();e.returnValue='';}});
 }

 // ---------- extension hand-off (same protocol as the extension's bridge.js) ----------
 let handoffTimer=0,handoffAttempts=0;
 document.addEventListener('peleja-import-delivery',event=>{
  if(typeof event.detail!=='string'||event.detail.length>PelejaQuiz.MAX+1000)return;
  let delivery;try{delivery=JSON.parse(event.detail);}catch{return;}
  const token=importToken();
  if(!token||delivery.token!==token||received===token)return;
  if(!delivery.quiz){status('O envio expirou. Na aba do quiz, clique em Adicionar ao Peleja de novo.','error');return;}
  received=token;clearTimeout(handoffTimer);review(delivery.quiz);
 });
 function requestHandoff(){
  clearTimeout(handoffTimer);
  const token=importToken();
  if(!token||received===token)return;
  $('entry').hidden=true;status('Recebendo questões da extensão…','busy');
  document.dispatchEvent(new CustomEvent('peleja-import-request'));
  if(received===token)return;
  if(++handoffAttempts<30)handoffTimer=setTimeout(requestHandoff,500);
  else{$('entry').hidden=false;status('A extensão não entregou as questões. Confira se ela está ativa e clique em Adicionar ao Peleja de novo.','error');}
 }

 // ---------- start ----------
 try{
  if(!globalThis.supabase)await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js');
  const config=globalThis.PELEJA_ACCESS_CONFIG;
  client=supabase.createClient(config.url,config.key,{auth:{storageKey:'peleja-next-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const {data:{session}}=await client.auth.getSession();
  if(!session){$('gate').querySelector('p').textContent='Abrindo o acesso…';leave(accessUrl());return;}
  const access=await client.rpc('has_peleja_access');
  if(access.error||access.data!==true){fail('Sua conta ainda não está autorizada.');return;}
  const [admin,workspace,profile]=await Promise.all([client.rpc('is_peleja_admin'),client.rpc('get_workspace'),client.from('profiles').select('display_name').eq('id',session.user.id).maybeSingle()]);
  if(admin.error)throw admin.error;if(workspace.error)throw workspace.error;
  const prefs={dark:false,motion:true,...workspace.data?.payload?.preferences?.pelejaNext};
  $('app').classList.toggle('dark',!!prefs.dark);document.documentElement.classList.toggle('dark',!!prefs.dark);
  document.documentElement.dataset.pelejaMotion=prefs.motion?'on':'off';
  $('avatar').textContent=(profile.data?.display_name||'?').slice(0,1).toLocaleUpperCase('pt-BR');
  if(admin.data!==true){$('denied').hidden=false;ready();return;}
  materials=(workspace.data?.catalog?.materials||[]).filter(m=>m&&m.id&&m.title);
  const bySubject=new Map();
  for(const m of [...materials].sort((a,b)=>String(a.subject).localeCompare(String(b.subject),'pt-BR')||String(a.title).localeCompare(String(b.title),'pt-BR',{numeric:true}))){
   const subject=m.subject||'Sem disciplina';if(!bySubject.has(subject))bySubject.set(subject,el('optgroup',{label:subject}));
   bySubject.get(subject).append(el('option',{value:m.id,textContent:m.title}));
  }
  $('material').append(...bySubject.values());
  wireInputs();
  await loadSets();
  $('workspace').hidden=false;ready();
  addEventListener('hashchange',()=>{handoffAttempts=0;requestHandoff();});
  requestHandoff();
 }catch(error){console.error(error);fail('Não foi possível carregar. Volte ao acesso e tente novamente.');}
})();
