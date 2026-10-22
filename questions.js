/* Private question sessions independent of the shared handout catalog. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), store = globalThis.PELEJA_STORAGE;
  const key = 'peleja_question_sessions_v1', modal = $('standaloneQuestionsModal');
  const fields = {subject:$('sessionSubject'),specialty:$('sessionSpecialty'),date:$('sessionDate'),questions:$('sessionTotal'),correct:$('sessionCorrect'),wrong:$('sessionWrong')};
  let owner = null, generation = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sessions = () => JSON.parse(store.getItem(key) || '[]');
  const today = () => { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  function reset() { $('standaloneQuestionsForm').reset();$('sessionId').value='';fields.date.value=today();$('sessionMessage').textContent='';$('saveSession').textContent='Adicionar questões';$('cancelSessionEdit').hidden=true; }
  function render() {
    const entries=sessions().sort((a,b)=>b.date.localeCompare(a.date));
    $('sessionHistory').innerHTML=entries.length ? entries.map(e=>`<article class="question-entry-card standalone-session"><div><strong>${escape(e.subject)}${e.specialty ? ' · '+escape(e.specialty) : ''}</strong><small>${escape(e.date.split('-').reverse().join('/'))} · ${escape(e.questions)} questões · ${escape(e.correct)} acertos · ${escape(e.wrong)} erros</small></div><button type="button" class="ghost-button" data-edit-session="${escape(e.id)}">Editar</button><button type="button" class="ghost-button" data-delete-session="${escape(e.id)}">Excluir</button></article>`).join('') : '<p class="question-entry-empty">Nenhuma sessão registrada aqui ainda.</p>';
  }
  function currentOwner() { return store.writable && owner===store.scope && generation===store.generation; }
  function persist(entries) {
    if (!currentOwner()) throw new Error('A conta mudou. Reabra o formulário.');
    store.setItem(key,JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent('peleja:data-changed',{detail:{kind:'questionSessions'}}));
  }
  function close() { modal.classList.remove('open');modal.setAttribute('aria-hidden','true');reset(); }
  function suggestions() {
    const materials=JSON.parse(store.getItem('medstudy_materials_v1') || '[]');
    const all=[...materials,...sessions()];
    $('sessionSubjects').innerHTML=[...new Set(all.map(e=>e.subject).filter(Boolean))].sort().map(s=>`<option value="${escape(s)}"></option>`).join('');
    $('sessionSpecialties').innerHTML=[...new Set(all.filter(e=>e.subject===fields.subject.value).map(e=>e.specialty).filter(Boolean))].sort().map(s=>`<option value="${escape(s)}"></option>`).join('');
  }
  window.addEventListener('peleja:open-questions',()=>{
    if (!store.writable) return;
    owner=store.scope;generation=store.generation;reset();suggestions();render();modal.classList.add('open');modal.setAttribute('aria-hidden','false');fields.subject.focus();
  });
  window.addEventListener('peleja:storage-changed',()=>{close();$('sessionHistory').replaceChildren();$('sessionSubjects').replaceChildren();$('sessionSpecialties').replaceChildren();owner=null;});
  $('closeStandaloneQuestions').addEventListener('click',close);
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  $('cancelSessionEdit').addEventListener('click',reset);
  fields.subject.addEventListener('input',suggestions);
  // Derive the remaining count while still allowing any field to be corrected.
  const completeCounts=()=>{const total=Number(fields.questions.value),correct=Number(fields.correct.value);if(fields.questions.value!=='' && fields.correct.value!=='' && Number.isInteger(total) && Number.isInteger(correct) && total>=correct) fields.wrong.value=total-correct;};
  fields.questions.addEventListener('input',completeCounts);fields.correct.addEventListener('input',completeCounts);
  $('standaloneQuestionsForm').addEventListener('submit',e=>{
    e.preventDefault();
    try {
      const entries=sessions(),id=$('sessionId').value,existing=entries.find(e=>e.id===id),now=new Date().toISOString();
      const item={id:id || 'qs-'+crypto.randomUUID(),subject:fields.subject.value.trim(),specialty:fields.specialty.value.trim(),date:fields.date.value,createdAt:existing?.createdAt || now,updatedAt:now};
      for(const name of ['questions','correct','wrong']) {if(fields[name].value==='') throw new Error('Preencha total, acertos e erros.');item[name]=Number(fields[name].value);}
      if(!item.subject || item.subject.length>120 || item.specialty.length>120 || !item.date)throw new Error('Preencha a disciplina e a data.');
      if(![item.questions,item.correct,item.wrong].every(Number.isInteger) || item.questions<1 || item.questions>100000 || item.correct<0 || item.wrong<0 || item.correct+item.wrong!==item.questions)throw new Error('Acertos + erros deve ser igual ao total, usando números inteiros.');
      persist(id ? entries.map(e=>e.id===id?item:e) : [...entries,item]);reset();render();suggestions();$('sessionMessage').textContent='Questões salvas. Elas serão sincronizadas com sua conta.';
    } catch(err){$('sessionMessage').textContent=err.message;}
  });
  $('sessionHistory').addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit-session]'),remove=e.target.closest('[data-delete-session]');
    if(!currentOwner())return;
    const id=edit?.dataset.editSession || remove?.dataset.deleteSession,entry=sessions().find(e=>e.id===id);if(!entry)return;
    if(edit){reset();$('sessionId').value=id;for(const [name,el] of Object.entries(fields))el.value=entry[name] || (entry[name]===0 ? 0 : '');$('saveSession').textContent='Salvar alteração';$('cancelSessionEdit').hidden=false;fields.subject.focus();}
    if(remove && confirm('Excluir esta sessão de questões?')) {persist(sessions().filter(e=>e.id!==id));reset();render();}
  });
})();
