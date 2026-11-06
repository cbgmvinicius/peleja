// Questions after import: members suggest changes (kind + explanation up to 500 characters, AnkiHub style);
// the administrator edits a set (title and questions) and reviews the suggestions, accepting or rejecting.
globalThis.PELEJA_INSTALL_QUESTION_REVIEW=({client,allowed})=>{
 const LETTERS='ABCDEFGHIJKLMNOPQRST';
 const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children.filter(c=>c!=null&&c!==false));return node;};
 const message=error=>String(error?.message||error||'').replace(/^Error:\s*/,'')||'Não foi possível concluir. Tente novamente.';
 const KINDS=[['answer','Gabarito errado','A alternativa marcada como certa não é a certa.'],['content','Erro de conteúdo','Uma informação da questão ou das alternativas está errada.'],['explanation','Comentário ou explicação','O comentário de alguma alternativa está errado ou incompleto.'],['wording','Enunciado confuso','Dá para entender de mais de um jeito ou falta informação.'],['spelling','Ortografia ou gramática','Erro de digitação, acento ou concordância.'],['outdated','Conteúdo desatualizado','Mudou a conduta, a diretriz ou a classificação.'],['other','Outro','Qualquer outra coisa.']];
 const kindName=k=>KINDS.find(x=>x[0]===k)?.[1]||'Outro';
 const dialog=el('dialog',{id:'qrDialog',className:'qr-dialog'});app.append(dialog);
 const close=()=>{if(dialog.open)dialog.close();};
 dialog.addEventListener('click',e=>{if(e.target===dialog&&!dialog.dataset.busy)close();});
 function shell(kicker,title,body,footer){
  const x=el('button',{type:'button',className:'icon',textContent:'✕',onclick:()=>guardClose()});x.setAttribute('aria-label','Fechar');
  dialog.replaceChildren(el('div',{className:'qr-body'},el('div',{className:'editor-heading'},el('div',{},el('span',{className:'editor-kicker',textContent:kicker}),el('h2',{textContent:title})),x),el('div',{className:'qr-scroll'},...body),footer?el('div',{className:'editor-footer'},...footer):null));
  if(!dialog.open)dialog.showModal();
  motion(dialog.querySelector('.qr-body'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'});
 }
 let dirty=()=>false;
 function guardClose(){if(dirty())confirmPeleja('Descartar as alterações?',()=>{dirty=()=>false;close();});else close();}
 dialog.addEventListener('cancel',e=>{e.preventDefault();guardClose();});
 dialog.addEventListener('close',()=>{dirty=()=>false;});

 // ---------- member: suggest a change ----------
 function suggest(setId,index,label){
  let kind='';
  const kinds=el('div',{className:'qr-kinds',role:'radiogroup'});kinds.setAttribute('aria-label','Tipo de mudança');
  const paint=()=>{for(const b of kinds.children)b.setAttribute('aria-checked',String(b.dataset.kind===kind));refresh();};
  for(const [id,name,note] of KINDS){const b=el('button',{type:'button',role:'radio',onclick:()=>{kind=id;paint();}},el('span',{className:'qr-radio','aria-hidden':'true'}),el('span',{},el('strong',{textContent:name}),el('small',{textContent:note})));b.dataset.kind=id;kinds.append(b);}
  const text=el('textarea',{id:'qrNote',maxLength:500,rows:4,placeholder:'Explique o que deveria mudar e, se puder, de onde tirou (livro, diretriz, aula).'});
  const counter=el('small',{className:'qr-counter',textContent:'0/500'}),error=el('p',{className:'qr-error',role:'alert'});
  const send=el('button',{type:'button',className:'primary',id:'qrSend',textContent:'Enviar sugestão'});
  function refresh(){counter.textContent=`${text.value.length}/500`;send.disabled=!kind||!text.value.trim();}
  text.oninput=refresh;
  send.onclick=async()=>{
   if(send.disabled)return;send.disabled=true;dialog.dataset.busy='1';error.textContent='';
   try{const r=await client.rpc('question_suggestion_submit',{p_set:setId,p_index:index,p_kind:kind,p_note:text.value.trim().slice(0,500)});if(r.error)throw r.error;dirty=()=>false;close();toast('Sugestão enviada · o administrador vai analisar','info');}
   catch(e){error.textContent=message(e);send.disabled=false;}finally{delete dialog.dataset.busy;}
  };
  dirty=()=>!!text.value.trim();
  shell('SUGERIR MUDANÇA',label||'Questão',[el('p',{className:'qr-lead',textContent:'O que está errado ou pode melhorar?'}),kinds,el('label',{className:'editor-field qr-note'},el('span',{},'Explicação ',counter),text),error],[el('button',{type:'button',className:'editor-cancel',textContent:'Cancelar',onclick:()=>guardClose()}),send]);
  refresh();
 }

 // ---------- administrator: edit a set ----------
 const area=(value,label,rows=2)=>{const t=el('textarea',{value:value||'',rows});t.setAttribute('aria-label',label);return t;};
 async function editSet(setId,focusIndex=null,suggestion=null){
  shell('EDITAR QUESTÕES','Carregando…',[el('p',{className:'qr-lead',textContent:'Carregando o conjunto…'})]);
  let set;try{const r=await client.rpc('question_set',{p_id:setId});if(r.error||!r.data)throw r.error||Error('Conjunto não encontrado');set=r.data;}catch(e){shell('EDITAR QUESTÕES','Não deu',[el('p',{className:'qr-error',textContent:message(e)})]);return;}
  const listInfo=(await client.rpc('question_sets_list').catch(()=>({data:[]})))?.data?.find?.(s=>s.id===setId);
  let pendingList=[];try{const r=await client.rpc('question_suggestions_review_list',{p_status:'pending'});pendingList=(r.data||[]).filter(s=>s.setId===setId);}catch{}
  const title=el('input',{value:listInfo?.title||set.title||'',maxLength:200,id:'qrSetTitle'});
  const original=JSON.stringify({t:title.value,q:set.questions});
  const forms=set.questions.map((q,i)=>{
   const stem=area(q.question,`Enunciado da questão ${i+1}`,3),hint=area(q.hint||'',`Dica da questão ${i+1}`,2);
   const name='qrCorrect'+i,opts=q.answerOptions.map((o,j)=>{const radio=el('input',{type:'radio',name,checked:!!o.isCorrect});radio.setAttribute('aria-label',`Alternativa ${LETTERS[j]} é a certa`);return {radio,text:area(o.text,`Alternativa ${LETTERS[j]}`,1),why:area(o.rationale,`Comentário da alternativa ${LETTERS[j]}`,2)};});
   const tips=pendingList.filter(s=>s.index===i);
   const box=el('details',{className:'qr-question',open:i===focusIndex},
    el('summary',{},el('b',{textContent:`Questão ${i+1}`}),el('span',{className:'qr-stem-preview',textContent:q.question}),tips.length?el('span',{className:'qr-badge',textContent:tips.length===1?'1 sugestão':tips.length+' sugestões'}):null),
    ...tips.map(s=>reviewCard(s,true)),
    el('label',{className:'editor-field'},el('span',{textContent:'Enunciado'}),stem),
    ...opts.map((o,j)=>el('div',{className:'qr-option'},el('label',{className:'qr-correct'},o.radio,el('span',{textContent:LETTERS[j]})),el('div',{className:'qr-option-fields'},o.text,o.why))),
    el('label',{className:'editor-field'},el('span',{textContent:'Dica (opcional)'}),hint));
   return {box,read:()=>({...q,question:stem.value.trim(),hint:hint.value.trim(),answerOptions:q.answerOptions.map((o,j)=>({...o,text:opts[j].text.value.trim(),rationale:opts[j].why.value.trim(),isCorrect:opts[j].radio.checked}))})};
  });
  const read=()=>({t:title.value.trim(),q:forms.map(f=>f.read())});
  dirty=()=>JSON.stringify(read())!==JSON.stringify({t:JSON.parse(original).t.trim(),q:JSON.parse(original).q});
  const error=el('p',{className:'qr-error',role:'alert'}),save=el('button',{type:'button',className:'primary',id:'qrSave',textContent:'Salvar alterações'});
  async function persist(){
   const v=read();if(!v.t)throw Error('Dê um título ao conjunto.');
   const bad=v.q.findIndex(q=>!q.question||q.answerOptions.some(o=>!o.text||!o.rationale));if(bad>=0)throw Error(`Questão ${bad+1}: enunciado, alternativas e comentários não podem ficar vazios.`);
   const r=await client.rpc('question_set_update',{p_id:setId,p_title:v.t,p_questions:v.q});if(r.error)throw r.error;
  }
  save.onclick=async()=>{save.disabled=true;error.textContent='';try{await persist();dirty=()=>false;close();toast('Questões atualizadas','info');globalThis.PELEJA_REFRESH_SOLVER?.();onChange();}catch(e){error.textContent=message(e);}finally{save.disabled=false;}};
  shell('EDITAR QUESTÕES',`${set.questions.length} ${set.questions.length===1?'questão':'questões'}`,[el('label',{className:'editor-field'},el('span',{textContent:'Título do conjunto'}),title),el('p',{className:'qr-lead',textContent:'Dá para corrigir textos, comentários, a dica e qual alternativa é a certa. A quantidade de questões e de alternativas fica a mesma.'}),...forms.map(f=>f.box),error],[el('button',{type:'button',className:'editor-cancel',textContent:'Cancelar',onclick:()=>guardClose()}),save]);
  editing={setId,persist};
  if(focusIndex!=null)setTimeout(()=>forms[focusIndex]?.box.scrollIntoView?.({block:"start"}),60);
 }
 let editing=null;

 // ---------- administrator: suggestions queue ----------
 function reviewCard(s,inEditor=false){
  const when=new Date(s.createdAt).toLocaleDateString('pt-BR',{day:'numeric',month:'short'});
  const accept=el('button',{type:'button',className:'primary',textContent:inEditor?'Salvar e aceitar':'Aceitar'}),reject=el('button',{type:'button',className:'editor-cancel',textContent:'Recusar'});
  const open=inEditor?null:el('button',{type:'button',className:'editor-cancel',textContent:'Abrir questão',onclick:()=>editSet(s.setId,s.index,s)});
  const card=el('article',{className:'qr-review'},el('div',{className:'qr-review-head'},el('span',{className:'qr-kind',textContent:kindName(s.kind)}),el('small',{textContent:`${s.author} · ${when}`})),
   inEditor?null:el('p',{className:'qr-review-where',textContent:`${s.setTitle} · Questão ${s.index+1}`}),
   inEditor?null:el('p',{className:'qr-review-stem',textContent:s.question?.question||''}),
   el('p',{className:'qr-review-note',textContent:s.note}),
   s.status==='pending'?el('div',{className:'qr-review-actions'},open,reject,accept):el('p',{className:'qr-review-done',textContent:s.status==='accepted'?'Aceita':'Recusada'}));
  const decide=async ok=>{
   accept.disabled=reject.disabled=true;
   try{if(ok&&inEditor&&editing&&dirty())await editing.persist();const r=await client.rpc('question_suggestion_review',{p_id:s.id,p_accept:ok});if(r.error)throw r.error;
    toast(ok?'Sugestão aceita':'Sugestão recusada','info');if(inEditor){if(!dirty()){card.remove();}else{dirty=()=>false;close();globalThis.PELEJA_REFRESH_SOLVER?.();}}else card.replaceWith(reviewCard({...s,status:ok?'accepted':'rejected'}));onChange();}
   catch(e){toast(message(e),'info');accept.disabled=reject.disabled=false;}
  };
  accept.onclick=()=>decide(true);reject.onclick=()=>confirmPeleja('Recusar esta sugestão?',()=>decide(false),{description:'Ela sai da fila e quem enviou vê que foi recusada.',accept:'Recusar'});
  return card;
 }
 let tab='pending';
 async function queue(){
  shell('SUGESTÕES','Sugestões de mudança',[el('p',{className:'qr-lead',textContent:'Carregando…'})]);
  let list=[];try{const r=await client.rpc('question_suggestions_review_list',{p_status:tab==='pending'?'pending':null});if(r.error)throw r.error;list=r.data||[];}catch(e){shell('SUGESTÕES','Sugestões de mudança',[el('p',{className:'qr-error',textContent:message(e)})]);return;}
  if(tab==='history')list=list.filter(s=>s.status!=='pending').reverse();
  const tabs=el('div',{className:'qr-tabs',role:'group'});
  for(const [id,label] of [['pending','Em análise'],['history','Já revisadas']]){const b=el('button',{type:'button',textContent:label,onclick:()=>{tab=id;queue();}});b.setAttribute('aria-pressed',String(id===tab));tabs.append(b);}
  shell('SUGESTÕES','Sugestões de mudança',[tabs,...(list.length?list.map(s=>reviewCard(s)):[el('p',{className:'qr-empty',textContent:tab==='pending'?'Nenhuma sugestão esperando análise.':'Nada revisado ainda.'})])]);
 }

 // ---------- menu entry and badge ----------
 const entry=document.createElement('button');entry.dataset.create='suggestions';entry.hidden=true;entry.textContent='Sugestões de questões';
 $('eventMenu').append(entry);entry.addEventListener('click',e=>{e.stopPropagation();closeMenus();tab='pending';queue();});
 async function onChange(){if(!allowed())return;try{const r=await client.rpc('question_suggestions_review_list',{p_status:'pending'});const n=(r.data||[]).length;entry.textContent=n?`Sugestões de questões (${n})`:'Sugestões de questões';}catch{}}
 globalThis.PELEJA_SUGGEST=suggest;globalThis.PELEJA_EDIT_SET=(id,index)=>editSet(id,index??null);
 return {
  ready(){entry.hidden=!allowed();onChange();},
  reset(){entry.hidden=true;dirty=()=>false;close();},
  suggest,editSet,queue
 };
};
