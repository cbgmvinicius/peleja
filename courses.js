(() => {
  'use strict';
  const catalog = globalThis.PELEJA_COURSES;
  const store = globalThis.PELEJA_STORAGE;
  const key = 'medstudy_courses_v1';
  const root = document.getElementById('extraCourses');
  const queue = document.getElementById('cardioQueue');
  const lessons = catalog.modules.flatMap(m => m.lessons.map(l => ({...l, module: m.title, scheduled: m.scheduled})));
  const scheduled = lessons.filter(l => l.scheduled);
  const anchor = scheduled.findIndex(l => l.id === catalog.anchorLesson);
  const dates = new Map(scheduled.map((l, i) => [l.id, new Date(Date.parse(catalog.anchorDate + 'T12:00:00Z') + (i-anchor)*86400000).toISOString().slice(0,10)]));
  let courseOpen = false;
  let pendingOnly = false;
  let expanded = null;
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const format = date => new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  const records = () => JSON.parse(store.getItem(key) || '[]').filter(r => r && typeof r.id === 'string');
  const heart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.8 4.6c-2.4-2.4-6.2-1.7-8.8 1.4-2.6-3.1-6.4-3.8-8.8-1.4C-1.4 9.2 5.4 16 12 21c6.6-5 13.4-11.8 8.8-16.4Z"/><path d="M3 12h5l2-4 3 8 2-4h6"/></svg>';
  function row(lesson, watched, compact = false) {
    const date = dates.get(lesson.id), day = today();
    const label = watched ? 'Vista' : date === day ? 'Hoje' : date && date < day ? 'Pendente' : date ? 'Programada' : 'Extra';
    return `<label class="course-lesson${watched ? ' is-watched' : ''}"><input type="checkbox" data-course-lesson="${lesson.id}" ${watched?'checked':''} ${store.writable?'':'disabled'} aria-label="Marcar como vista: ${escape(lesson.title)}"><span class="course-lesson-copy"><strong>${escape(lesson.title)}</strong><small>${compact ? escape(lesson.module)+' · ' : ''}${date ? format(date)+' · ' : ''}${label}</small></span></label>`;
  }
  function render() {
    const watched = new Set(records().map(r => r.id));
    const day = today();
    const pending = scheduled.filter(l => dates.get(l.id)<=day && !watched.has(l.id));
    const dueToday = pending.filter(l => dates.get(l.id)===day);
    const shown = [...dueToday,...pending.filter(l => dates.get(l.id)!==day)].slice(0,4);
    document.getElementById('cardioQueueSummary').textContent = !store.writable ? 'Entre na sua conta para acompanhar suas aulas.' : pending.length ? `${pending.length} aula${pending.length===1?' pendente':'s pendentes'} até hoje. Fique em dia no seu ritmo.` : 'Você está em dia! Nenhuma aula pendente até hoje.';
    queue.innerHTML = store.writable ? shown.map(l => row(l, false, true)).join('') : '';
    if (!courseOpen) {
      root.innerHTML = `<div class="extra-course-grid"><button class="panel extra-course-card" id="enterCardio"><span class="course-symbol">${heart}</span><span class="eyebrow">UMA AULA POR DIA</span><h2>CardioPapers ECG</h2><p>Do primeiro traçado à prática clínica.</p><span>${lessons.filter(l=>watched.has(l.id)).length} de ${lessons.length} aulas vistas</span><strong class="course-link">Ver aulas →</strong></button><article class="panel extra-course-card course-soon"><span class="course-symbol" aria-hidden="true">Aa</span><span class="eyebrow">INGLÊS</span><h2>Mário Vergara</h2><p>Seu próximo espaço de estudos.</p><span class="course-tag">Em breve</span></article></div>`;
      document.getElementById('enterCardio').addEventListener('click',openCourse);
      return;
    }
    const seen = lessons.filter(l=>watched.has(l.id)).length;
    const current = catalog.modules.find(m=>m.lessons.some(l=>dates.get(l.id)===day)) || catalog.modules.find(m=>m.lessons.some(l=>pending.includes(scheduled.find(x=>x.id===l.id)))) || catalog.modules[0];
    const open = expanded || new Set([current.id]);
    root.innerHTML = `<button class="text-button course-back" id="backToCourses">← Cursos extras</button><article class="panel course-overview"><span class="eyebrow">UMA AULA POR DIA</span><h2>CardioPapers ECG</h2><p>Seu progresso individual, uma aula de cada vez.</p><div class="course-stats"><strong>${seen}<small>de ${lessons.length} vistas</small></strong><strong>${pending.length}<small>pendentes até hoje</small></strong></div><progress max="${lessons.length}" value="${seen}" aria-label="Progresso no CardioPapers"></progress><p class="course-schedule-note">Uma aula por dia, inclusive fins de semana. Aulas extras sem prazo.</p></article><div class="course-filter"><label><input type="checkbox" id="coursePendingOnly" ${pendingOnly?'checked':''}> Só pendentes até hoje</label>${scheduled.some(l=>dates.get(l.id)===day)?'<button class="text-button" id="jumpToToday">Aula de hoje ↓</button>':''}</div><div class="course-modules">${catalog.modules.map(m=>{
      const visible=m.lessons.filter(l=>!pendingOnly || (dates.get(l.id)<=day && !watched.has(l.id)));
      if(!visible.length) return '';
      return `<details class="panel course-module" data-module="${m.id}" ${open.has(m.id)||pendingOnly?'open':''}><summary><span>${escape(m.title)}${m.scheduled?'':' · Extra'}</span><small>${m.lessons.filter(l=>watched.has(l.id)).length}/${m.lessons.length}</small></summary><div>${visible.map(l=>row(l,watched.has(l.id))).join('')}</div></details>`;
    }).join('') || '<p class="panel">Tudo em dia por aqui.</p>'}</div>`;
    const jump = document.getElementById('jumpToToday');
    if (jump) jump.onclick = () => { pendingOnly=false; expanded=new Set([current.id]); render(); const target=root.querySelector(`[data-course-lesson="${scheduled.find(l=>dates.get(l.id)===day).id}"]`); target.scrollIntoView({block:'center'}); target.focus({preventScroll:true}); };
    document.getElementById('backToCourses').onclick=()=>{courseOpen=false;render();};
    document.getElementById('coursePendingOnly').onchange=e=>{pendingOnly=e.target.checked;render();};
  }
  function openCourse() {courseOpen=true;render();}
  function change(event) {
    const input=event.target.closest('[data-course-lesson]');
    if(!input) return;
    const id=input.dataset.courseLesson;
    if(!store.writable || !lessons.some(l=>l.id===id)) {render();return;}
    if(courseOpen) expanded=new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.module));
    try {
      const next=records().filter(r=>r.id!==id);
      if(input.checked) next.push({id,watchedAt:new Date().toISOString()});
      store.setItem(key,JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('peleja:data-changed',{detail:{kind:'courses'}}));
      render();
      // Preserve keyboard focus across re-render without selecting a different lesson.
      const replacement=event.currentTarget.querySelector(`[data-course-lesson="${id}"]`);
      (replacement || (event.currentTarget === root ? document.getElementById('coursePendingOnly') : document.getElementById('openCardioCourse'))).focus();
    } catch(error) {
      render();
      window.alert('Não foi possível salvar a marcação. '+error.message);
    }
  }
  root.addEventListener('change',change);
  queue.addEventListener('change',change);
  document.getElementById('openCardioCourse').onclick=()=>{document.querySelector('[data-view="courses"]').click();openCourse();};
  window.addEventListener('peleja:storage-changed',()=>{expanded=null;render();});
  window.addEventListener('peleja:data-changed',render);
  window.addEventListener('peleja:view-changed',render);
  window.addEventListener('focus',render);
  // Refresh the daily queue even when the page remains open overnight.
  let lastDay=today();setInterval(()=>{if(today()!==lastDay){lastDay=today();render();}},60000);
  render();
})();
