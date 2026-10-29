// This editor writes only to the isolated, in-memory demonstration catalog.
let questionsCode=null,questionRoundId=null,questionsInitial='',questionCelebrationTimer,questionCelebrationButton=null,questionResultEffects=[];
let questionIconReturn=null;
function cancelQuestionIconReturn(){
  if(!questionIconReturn)return;
  const state=questionIconReturn;questionIconReturn=null;
  state.animations.forEach(animation=>animation?.cancel());
  state.button.innerHTML=svg('target');state.button.classList.remove('question-icon-return','question-completed');
}
function returnQuestionIcon(button){
  if(!button.isConnected||reduceMotion()){button.innerHTML=svg('target');button.classList.remove('question-completed');return;}
  const check=button.querySelector('svg');
  button.insertAdjacentHTML('beforeend',svg('target'));const target=button.lastElementChild;
  button.classList.add('question-icon-return');
  const state={button,animations:[]};questionIconReturn=state;
  const out=motion(check,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.85)'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
  const incoming=motion(target,[{opacity:0,transform:'scale(.85)'},{opacity:1,transform:'scale(1)'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
  state.animations=[out,incoming];
  if(incoming)incoming.onfinish=()=>{if(questionIconReturn===state)cancelQuestionIconReturn();};else cancelQuestionIconReturn();
}
function clearQuestionCelebration(immediate=true){
  clearTimeout(questionCelebrationTimer);
  if(immediate)cancelQuestionIconReturn();
  questionResultEffects.forEach(({animation,element})=>{animation?.cancel();element?.remove();});questionResultEffects=[];
  if(questionCelebrationButton){
    const button=questionCelebrationButton;questionCelebrationButton=null;clearStudyEffects(button);
    if(immediate){button.classList.remove('question-completed');button.innerHTML=svg('target');}
    else returnQuestionIcon(button);
  }
}
function celebrateQuestionRound(round){
  clearQuestionCelebration();
  const button=[...document.querySelectorAll('[data-questions]')].find(b=>b.dataset.questions===questionsCode);
  toast(`Rodada salva · ${Math.round(round.c/round.q*100)}% de acertos`,'target');
  if(!button)return;
  questionCelebrationButton=button;button.classList.add('question-completed');
  button.innerHTML=svg('check');celebrateStudy(button,button);
  celebrateQuestionTotals(button.closest('.row').querySelector('.stats'),round);
  questionCelebrationTimer=setTimeout(()=>clearQuestionCelebration(false),1650);
}
function celebrateQuestionTotals(stats,round,label=null){
  // A single composited layer keeps the badge and highlight in lockstep.
  const feedback=document.createElement('div');feedback.className='question-result-feedback';feedback.setAttribute('aria-hidden','true');
  const badge=document.createElement('div');badge.className='question-gain';
  badge.textContent=label||`+${round.q} ${round.q===1?'questão':'questões'}`;feedback.append(badge);stats.append(feedback);
  const completion=motion(feedback,[{opacity:0,offset:0,easing:'ease-out'},{opacity:1,offset:220/1600},{opacity:1,offset:1400/1600,easing:'ease-in'},{opacity:0,offset:1}],{duration:1600,easing:'linear',fill:'both'});
  questionResultEffects.push({animation:completion,element:feedback});
  if(completion)completion.onfinish=()=>clearQuestionCelebration(false);
}
let standaloneQuestions={q:0,c:0,w:0,questionRounds:[]};
function resetStandaloneQuestions(){standaloneQuestions={q:0,c:0,w:0,questionRounds:[]};}
const questionsSnapshot=()=>JSON.stringify(['questionsDate','questionsTotal','questionsCorrect',...(!questionsCode?['questionsDiscipline','questionsSpecialty']:[])].map(id=>$(id).value));
const currentQuestionSubject=()=>questionsCode?data.find(m=>m.code===questionsCode):standaloneQuestions;
function fillQuestionSpecialties(value=''){
  const subject=$('questionsDiscipline').value;
  const values=[...new Set([...(editorCurriculum[subject]||[]),...data.filter(m=>m.subject===subject).map(m=>m.specialty),value].filter(Boolean))];
  $('questionsSpecialty').replaceChildren(new Option(subject?'Sem especialidade':'Escolha a disciplina primeiro',''),...values.map(v=>new Option(v,v)));
  $('questionsSpecialty').value=value;$('questionsSpecialty').disabled=!!questionsCode||!subject;
}

const localQuestionDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function updateQuestionPreview(){
  const total=$('questionsTotal'),correct=$('questionsCorrect'),q=Number(total.value),c=Number(correct.value);
  correct.setCustomValidity('');
  const filled=total.value!==''&&correct.value!=='';
  const valid=filled&&Number.isSafeInteger(q)&&Number.isSafeInteger(c)&&q>0&&c>=0&&c<=q&&q<=100000;
  $('questionsWrong').value=valid?String(q-c):'—';
  const exceeds=filled&&c>q;
  $('questionsError').hidden=!exceeds;$('questionsError').textContent=exceeds?'Os acertos não podem superar o total.':'';
  if(exceeds)correct.setCustomValidity('Os acertos não podem superar o total.');
  return valid;
}
function resetQuestionFields(round=null){
  questionRoundId=round?.id||null;clearQuestionCelebration();
  if(!questionsCode&&round){$('questionsDiscipline').value=round.subject;fillQuestionSpecialties(round.specialty||'');}
  $('questionsDate').value=round?.date||localQuestionDate();
  $('questionsTotal').value=round?.q??'';$('questionsCorrect').value=round?.c??'';
  $('questionsTitle').textContent=round?'Editar rodada':'Registrar rodada';
  $('questionsSave').textContent=round?'Salvar alterações':'Concluído';
  $('questionsCancel').textContent=round?'Cancelar edição':'Cancelar';
  updateQuestionPreview();questionsInitial=questionsSnapshot();
}
function renderQuestionHistory(){
  const m=currentQuestionSubject(),base=m.questionBase||{q:m.q,c:m.c,w:m.w};
  const rounds=[...(m.questionRounds||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id.localeCompare(a.id));
  $('questionsHistory').innerHTML=rounds.map(r=>`<div class="question-round"><div>${!questionsCode?`<div class="question-round-scope">${escapeHtml(r.subject)}${r.specialty?' · '+escapeHtml(r.specialty):''}</div>`:''}<strong>${escapeHtml(r.date?new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR'):'Sem data')}</strong><p>${r.q} questões · ${r.c} acertos · ${r.w} erros</p></div><div class="question-round-actions"><button class="icon" type="button" data-round-edit="${r.id}" aria-label="Editar rodada de ${escapeHtml(r.date)}" title="Editar rodada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m15 4 5 5-11 11H4v-5ZM13 6l5 5"/></svg></button><button class="icon" type="button" data-round-delete="${r.id}" aria-label="Excluir rodada de ${escapeHtml(r.date)}" title="Excluir rodada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg></button></div></div>`).join('')+(base.q?`<div class="question-round"><div><strong>Acumulado anterior</strong><p>${base.q} questões · ${base.c} acertos · ${base.w} erros</p></div></div>`:'');
  if(!rounds.length&&!base.q)$('questionsHistory').innerHTML='<p class="questions-empty">Nenhuma rodada registrada.</p>';
}
function recomputeQuestions(m){
  const totals=(m.questionRounds||[]).reduce((t,r)=>({q:t.q+r.q,c:t.c+r.c,w:t.w+r.w}),{...m.questionBase});
  Object.assign(m,totals);render();renderQuestionHistory();
}
function openQuestions(code=null){
  questionsCode=code;closeMenus();const m=currentQuestionSubject();if(!m)return;
  $('questionsScope').hidden=!!code;$('questionsDiscipline').disabled=!!code;
  $('questionsSubject').hidden=!code;
  if(code){$('questionsSubject').textContent=(m.fullTitle||m.code+' '+m.title).toLocaleUpperCase('pt-BR');$('questionsSpecialty').disabled=true;}
  else{
    const subjects=[...new Set([...Object.keys(editorCurriculum),...data.map(x=>x.subject),...standaloneQuestions.questionRounds.map(r=>r.subject)])];
    $('questionsDiscipline').replaceChildren(new Option('Selecione',''),...subjects.map(v=>new Option(v,v)));
    $('questionsDiscipline').value=$('subject').value;fillQuestionSpecialties();
  }
  resetQuestionFields();renderQuestionHistory();$('questionsDialog').showModal();(!code&&!$('questionsDiscipline').value?$('questionsDiscipline'):$('questionsTotal')).focus();
  motion($('questionsForm'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.25,.1,.25,1)'});
}
function canDiscardQuestion(action){if(questionsSnapshot()===questionsInitial)action();else confirmPeleja('Descartar esta rodada?',action);}
function closeQuestions(force=false){
  if(force!==true&&questionsSnapshot()!==questionsInitial){canDiscardQuestion(()=>closeQuestions(true));return;}
  clearQuestionCelebration();$('questionsDialog').close();
  (questionsCode?[...document.querySelectorAll('[data-questions]')].find(b=>b.dataset.questions===questionsCode):$('new'))?.focus();
}
$('library').addEventListener('click',event=>{const b=event.target.closest('[data-questions]');if(b)openQuestions(b.dataset.questions);});
$('questionsTotal').oninput=$('questionsCorrect').oninput=()=>{clearQuestionCelebration();updateQuestionPreview();};
$('questionsDate').oninput=clearQuestionCelebration;
$('questionsDiscipline').onchange=()=>{fillQuestionSpecialties();clearQuestionCelebration();};
$('questionsSpecialty').onchange=clearQuestionCelebration;
$('questionsClose').onclick=closeQuestions;
$('questionsCancel').onclick=()=>{if(questionRoundId){canDiscardQuestion(()=>{resetQuestionFields();$('questionsTotal').focus();});}else closeQuestions();};
$('questionsDialog').addEventListener('cancel',e=>{e.preventDefault();closeQuestions();});
$('questionsForm').onsubmit=event=>{
  event.preventDefault();if(!$('questionsDialog').open)return;const valid=updateQuestionPreview();if(!$('questionsForm').reportValidity()||!valid)return;
  const m=currentQuestionSubject(),q=Number($('questionsTotal').value),c=Number($('questionsCorrect').value);
  m.questionBase??={q:m.q,c:m.c,w:m.w};m.questionRounds??=[];
  const round={id:questionRoundId||crypto.randomUUID(),date:$('questionsDate').value,q,c,w:q-c,...(!questionsCode?{subject:$('questionsDiscipline').value,specialty:$('questionsSpecialty').value}:{})};
  const index=m.questionRounds.findIndex(r=>r.id===questionRoundId);
  if(index>=0)m.questionRounds[index]=round;else m.questionRounds.push(round);
  recomputeQuestions(m);resetQuestionFields();closeQuestions();
  if(index>=0)toast('Rodada atualizada','edit');else celebrateQuestionRound(round);
};
$('questionsHistory').onclick=event=>{
  const edit=event.target.closest('[data-round-edit]'),remove=event.target.closest('[data-round-delete]');
  if(!edit&&!remove)return;
  const m=currentQuestionSubject(),id=edit?.dataset.roundEdit||remove.dataset.roundDelete,round=m.questionRounds?.find(r=>r.id===id);if(!round)return;
  if(edit){canDiscardQuestion(()=>{resetQuestionFields(round);$('questionsTotal').focus();});}
  else confirmPeleja('Excluir rodada?',()=>{m.questionRounds=m.questionRounds.filter(r=>r.id!==id);recomputeQuestions(m);if(questionRoundId===id)resetQuestionFields();$('questionsTotal').focus();toast('Rodada excluída','trash');},{description:`${round.q} questões · ${round.c} acertos. Os totais serão recalculados.`,accept:'Excluir',destructive:true});
};

function celebrateFacultyResult(exam,updated=false){
  clearQuestionCelebration();
  const button=[...document.querySelectorAll('[data-exam-result]')].find(b=>b.dataset.examResult===exam.id);
  toast(`${updated?'Resultado atualizado':'Resultado salvo'} · ${Math.round(exam.c/exam.q*100)}% de acertos`,'target');
  if(!button)return;
  button.focus();questionCelebrationButton=button;button.classList.add('question-completed');
  button.innerHTML=svg('check');celebrateStudy(button,button);
  celebrateQuestionTotals(button.closest('.faculty-card').querySelector('.stats'),exam,updated?'Resultado atualizado':`${exam.q} questões · ${exam.c} acertos`);
  questionCelebrationTimer=setTimeout(()=>clearQuestionCelebration(false),1650);
}
