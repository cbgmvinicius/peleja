// Questions after import, AnkiHub style: a member edits the question itself, marks the kind of change and
// explains why; the administrator sees before (removed text in red) and after (new text in green) and
// accepts (the change is applied) or rejects. Administrators find them under the bell in the top bar.
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
 // The question comes editable (stem, options, comments, which one is right, hint); kind + explanation below.
 async function suggest(setId,index,label){
  shell('SUGERIR MUDANÇA',label||'Questão',[el('p',{className:'qr-lead',textContent:'Carregando a questão…'})]);
  let current=null;try{const r=await client.rpc('question_set',{p_id:setId});if(r.error)throw r.error;current=r.data?.questions?.[index]||null;}catch{}
  let kind='';
  const kinds=el('div',{className:'qr-kinds',role:'radiogroup'});kinds.setAttribute('aria-label','Tipo de mudança');
  const paint=()=>{for(const b of kinds.children)b.setAttribute('aria-checked',String(b.dataset.kind===kind));refresh();};
  for(const [id,name,note] of KINDS){const b=el('button',{type:'button',role:'radio',onclick:()=>{kind=id;paint();}},el('span',{className:'qr-radio','aria-hidden':'true'}),el('span',{},el('strong',{textContent:name}),el('small',{textContent:note})));b.dataset.kind=id;kinds.append(b);}
  const text=el('textarea',{id:'qrNote',maxLength:500,rows:3,placeholder:'Por que mudar? Se puder, diga de onde tirou (livro, diretriz, aula).'});
  const counter=el('small',{className:'qr-counter',textContent:'0/500'}),error=el('p',{className:'qr-error',role:'alert'});
  const send=el('button',{type:'button',className:'primary',id:'qrSend',textContent:'Enviar sugestão'});
  const form=current?questionForm(current,'qrSug'):null;
  const proposal=()=>form?form.read():null;
  const changed=()=>!!form&&JSON.stringify(normalize(proposal()))!==JSON.stringify(normalize(current));
  function refresh(){counter.textContent=`${text.value.length}/500`;send.disabled=!kind||!text.value.trim();send.textContent=changed()?'Enviar sugestão com a mudança':'Enviar sugestão';}
  text.oninput=refresh;form?.root.addEventListener('input',refresh);form?.root.addEventListener('change',refresh);
  send.onclick=async()=>{
   if(send.disabled)return;
   const prop=changed()?proposal():null;
   if(prop){const bad=!prop.question||prop.answerOptions.some(o=>!o.text||!o.rationale);if(bad){error.textContent='Enunciado, alternativas e comentários não podem ficar vazios.';return;}}
   send.disabled=true;dialog.dataset.busy='1';error.textContent='';
   const args={p_set:setId,p_index:index,p_kind:kind,p_note:text.value.trim().slice(0,500)};
   try{
    let r=await client.rpc('question_suggestion_submit',{...args,p_proposed:prop});
    // a server without edited suggestions yet: send the explanation alone
    if(r.error&&/function|p_proposed|schema cache/i.test(r.error.message||'')&&!prop)r=await client.rpc('question_suggestion_submit',args);
    if(r.error)throw r.error;dirty=()=>false;close();toast(prop?'Sugestão com a mudança enviada · o administrador vai analisar':'Sugestão enviada · o administrador vai analisar','info');
   }catch(e){error.textContent=message(e);send.disabled=false;}finally{delete dialog.dataset.busy;}
  };
  dirty=()=>!!text.value.trim()||changed();
  shell('SUGERIR MUDANÇA',label||'Questão',[
   el('p',{className:'qr-lead',textContent:form?'Corrija direto na questão o que achar errado (opcional), marque o tipo e explique.':'O que está errado ou pode melhorar?'}),
   form?form.root:null,
   el('p',{className:'qr-section',textContent:'Tipo de mudança'}),kinds,el('label',{className:'editor-field qr-note'},el('span',{},'Por quê? ',counter),text),error],
   [el('button',{type:'button',className:'editor-cancel',textContent:'Cancelar',onclick:()=>guardClose()}),send]);
  refresh();
 }
 // Editable fields of one question (also used by the administrator's editor).
 function questionForm(q,prefix){
  const stem=area(q.question,'Enunciado',3),hint=area(q.hint||'','Dica',2);
  const name=prefix+'Correct',opts=q.answerOptions.map((o,j)=>{const radio=el('input',{type:'radio',name,checked:!!o.isCorrect});radio.setAttribute('aria-label',`Alternativa ${LETTERS[j]} é a certa`);return {radio,text:area(o.text,`Alternativa ${LETTERS[j]}`,1),why:area(o.rationale,`Comentário da alternativa ${LETTERS[j]}`,2)};});
  const root=el('div',{className:'qr-edit'},el('label',{className:'editor-field'},el('span',{textContent:'Enunciado'}),stem),
   el('p',{className:'qr-hint-line',textContent:'Marque a bolinha da alternativa certa.'}),
   ...opts.map((o,j)=>el('div',{className:'qr-option'},el('label',{className:'qr-correct'},o.radio,el('span',{textContent:LETTERS[j]})),el('div',{className:'qr-option-fields'},o.text,o.why))),
   el('label',{className:'editor-field'},el('span',{textContent:'Dica (opcional)'}),hint));
  return {root,read:()=>({question:stem.value.trim(),hint:hint.value.trim(),answerOptions:q.answerOptions.map((o,j)=>({...o,text:opts[j].text.value.trim(),rationale:opts[j].why.value.trim(),isCorrect:opts[j].radio.checked}))})};
 }
 const normalize=q=>q&&{question:(q.question||'').trim(),hint:(q.hint||'').trim(),answerOptions:(q.answerOptions||[]).map(o=>({text:(o.text||'').trim(),rationale:(o.rationale||'').trim(),isCorrect:!!o.isCorrect}))};

 // ---------- before / after (word diff) ----------
 const words=s=>String(s||'').split(/(\s+)/).filter(x=>x!=='');
 function diffWords(a,b){
  const x=words(a),y=words(b),n=x.length,m=y.length;
  if(n*m>250000)return {before:[['del',a]],after:[['ins',b]]};
  const L=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=x[i]===y[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const before=[],after=[],push=(list,k,t)=>{const last=list.at(-1);if(last&&last[0]===k)last[1]+=t;else list.push([k,t]);};
  let i=0,j=0;
  while(i<n&&j<m){if(x[i]===y[j]){push(before,'same',x[i]);push(after,'same',y[j]);i++;j++;}else if(L[i+1][j]>=L[i][j+1])push(before,'del',x[i++]);else push(after,'ins',y[j++]);}
  while(i<n)push(before,'del',x[i++]);while(j<m)push(after,'ins',y[j++]);
  return {before,after};
 }
 const paintDiff=parts=>parts.map(([k,t])=>k==='same'?document.createTextNode(t):el(k,{textContent:t}));
 // Only the fields that changed, each as "Antes" / "Depois".
 function diffView(current,proposed){
  const a=normalize(current),b=normalize(proposed),rows=[];
  const field=(label,x,y)=>{if(x===y)return;const d=diffWords(x,y);rows.push(el('div',{className:'qr-diff-row'},el('p',{className:'qr-diff-label',textContent:label}),
   el('div',{className:'qr-diff-pair'},el('div',{className:'qr-diff-box qr-before'},el('small',{textContent:'Antes'}),el('p',{},...(x?paintDiff(d.before):[el('em',{textContent:'(vazio)'})]))),
    el('div',{className:'qr-diff-box qr-after'},el('small',{textContent:'Depois'}),el('p',{},...(y?paintDiff(d.after):[el('em',{textContent:'(vazio)'})]))))));};
  field('Enunciado',a.question,b.question);
  const right=q=>LETTERS[q.answerOptions.findIndex(o=>o.isCorrect)]||'?';
  if(right(a)!==right(b))rows.push(el('div',{className:'qr-diff-row'},el('p',{className:'qr-diff-label',textContent:'Alternativa certa'}),el('p',{className:'qr-diff-answer'},el('del',{textContent:right(a)}),' → ',el('ins',{textContent:right(b)}))));
  a.answerOptions.forEach((o,j)=>{const n=b.answerOptions[j]||{};field(`Alternativa ${LETTERS[j]}`,o.text,n.text||'');field(`Comentário ${LETTERS[j]}`,o.rationale,n.rationale||'');});
  field('Dica',a.hint,b.hint);
  return rows.length?el('div',{className:'qr-diff'},...rows):el('p',{className:'qr-empty',textContent:'A questão já está igual à proposta.'});
 }

 // ---------- administrator: edit a set ----------
 const area=(value,label,rows=2)=>{const t=el('textarea',{value:value||'',rows});t.setAttribute('aria-label',label);return t;};
 async function editSet(setId,focusIndex=null,suggestion=null){
  shell('EDITAR QUESTÕES','Carregando…',[el('p',{className:'qr-lead',textContent:'Carregando o conjunto…'})]);
  let set;try{const r=await client.rpc('question_set',{p_id:setId});if(r.error||!r.data)throw r.error||Error('Conjunto não encontrado');set=r.data;}catch(e){shell('EDITAR QUESTÕES','Não deu',[el('p',{className:'qr-error',textContent:message(e)})]);return;}
  const listInfo=(await Promise.resolve(client.rpc('question_sets_list')).catch(()=>({data:[]})))?.data?.find?.(s=>s.id===setId);
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
  const accept=el('button',{type:'button',className:'primary',textContent:inEditor?'Salvar e aceitar':s.proposed?'Aceitar e aplicar':'Aceitar'}),reject=el('button',{type:'button',className:'editor-cancel',textContent:'Recusar'});
  const open=inEditor?null:el('button',{type:'button',className:'editor-cancel',textContent:'Abrir questão',onclick:()=>editSet(s.setId,s.index,s)});
  const card=el('article',{className:'qr-review'},el('div',{className:'qr-review-head'},el('span',{className:'qr-kind',textContent:kindName(s.kind)}),el('small',{textContent:`${s.author} · ${when}`})),
   inEditor?null:el('p',{className:'qr-review-where',textContent:`${s.setTitle} · Questão ${s.index+1}`}),
   inEditor?null:el('p',{className:'qr-review-stem',textContent:s.question?.question||''}),
   s.proposed&&s.question?diffView(s.question,s.proposed):null,
   el('p',{className:'qr-review-note'},el('b',{textContent:'Por quê: '}),s.note),
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

 // ---------- bell (administrators): notifications, suggestions stacked into one entry ----------
 const BELL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
 const bell=el('button',{type:'button',className:'icon qr-bell',id:'notifyBell',hidden:true,innerHTML:BELL});bell.setAttribute('aria-label','Notificações');bell.setAttribute('aria-expanded','false');
 const count=el('span',{className:'qr-bell-count',hidden:true});bell.append(count);
 const panel=el('div',{className:'event-menu qr-bell-panel',id:'notifyPanel',hidden:true});app.append(panel);
 ($('profile')?.parentElement||document.querySelector('.app header'))?.insertBefore(bell,$('profile')||null);
 let pending=0;
 const closePanel=()=>{panel.hidden=true;bell.setAttribute('aria-expanded','false');};
 function drawPanel(){
  const items=[];
  if(pending)items.push(el('button',{type:'button',className:'qr-note-item',onclick:()=>{closePanel();tab='pending';queue();}},el('span',{className:'qr-note-icon',innerHTML:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5Z"/></svg>'}),
   el('span',{className:'qr-note-text'},el('b',{textContent:pending===1?'1 sugestão de questão':`${pending} sugestões de questões`}),el('small',{textContent:'Esperando sua análise'})),el('span',{className:'qr-note-count',textContent:String(pending)})));
  items.push(el('button',{type:'button',className:'qr-note-item qr-note-history',onclick:()=>{closePanel();tab='history';queue();}},el('span',{className:'qr-note-text'},el('small',{textContent:'Ver sugestões já revisadas'}))));
  if(!pending)items.unshift(el('p',{className:'qr-note-empty',textContent:'Nada novo por aqui.'}));
  panel.replaceChildren(...items);
 }
 bell.addEventListener('click',e=>{e.stopPropagation();if(!panel.hidden){closePanel();return;}if(typeof closeMenus==='function')closeMenus();drawPanel();panel.hidden=false;bell.setAttribute('aria-expanded','true');if(typeof positionMenu==='function')positionMenu(panel,bell);onChange();});
 document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target))closePanel();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){closePanel();bell.focus();}});
 async function onChange(){
  if(!allowed())return;
  try{const r=await client.rpc('question_suggestions_review_list',{p_status:'pending'});pending=(r.data||[]).length;}catch{return;}
  count.hidden=!pending;count.textContent=pending>99?'99+':String(pending);bell.setAttribute('aria-label',pending?`Notificações: ${pending} novas`:'Notificações');
  if(!panel.hidden)drawPanel();
 }
 setInterval(()=>{if(!bell.hidden&&!document.hidden)onChange();},120000);
 globalThis.PELEJA_SUGGEST=suggest;globalThis.PELEJA_EDIT_SET=(id,index)=>editSet(id,index??null);
 return {
  ready(){bell.hidden=!allowed();onChange();},
  reset(){bell.hidden=true;closePanel();pending=0;count.hidden=true;dirty=()=>false;close();},
  suggest,editSet,queue
 };
};
