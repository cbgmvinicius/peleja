(() => {
  'use strict';
  const panel=document.getElementById('studyComparison');
  const list=document.getElementById('studyProgressList');
  const status=document.getElementById('studyProgressStatus');
  const hint=document.getElementById('studyProgressHint');
  const scope=document.getElementById('studyProgressScope');
  let kind='materials',rows=null,request=0;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function render() {
    const next=scope.checked;
    document.getElementById('studyProgressScopeWrap').hidden=kind==='courses';
    panel.querySelectorAll('[data-progress-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.progressKind===kind)));
    hint.textContent='';
    if(!rows){list.innerHTML='';return;}
    const metricOf=r=>kind==='courses'?r.courses:next?r.next:r.materials;
    const ranked=rows.filter(r=>r.has_data).sort((a,b)=>{const x=metricOf(a),y=metricOf(b);return (y.total?y.done/y.total:0)-(x.total?x.done/x.total:0)||y.done-x.done||a.name.localeCompare(b.name,'pt-BR');});
    list.innerHTML=ranked.map((r,index)=>{
      const metric=kind==='courses'?r.courses:next?r.next:r.materials;
      const percent=metric.total?Math.round(metric.done*100/metric.total):0;
      const detail=!r.has_data?'Ainda sem dados sincronizados':kind==='courses'?`${metric.done} de ${metric.total} aulas vistas`:next&&!metric.date?'Nenhuma próxima prova com data':!metric.total?'Nenhum assunto vinculado neste recorte':`${metric.done} de ${metric.total} assuntos estudados`;
      const exam=kind==='materials'&&next&&metric.date?`${new Date(metric.date+'T12:00:00').toLocaleDateString('pt-BR')} · ${(metric.exams||[]).join(' / ')}`:'';
      return `<div class="study-progress-row"><strong class="study-position" aria-label="${index+1}º lugar">${index+1}º</strong><span class="study-avatar" aria-hidden="true">${escape(r.name.slice(0,1))}</span><div class="study-progress-copy"><div class="study-progress-title"><strong>${escape(r.name)}</strong><span>${r.has_data&&metric.total?percent+'%':'—'}</span></div><small>${escape(detail)}</small>${exam?`<small class="study-progress-exam">${escape(exam)}</small>`:''}<progress value="${r.has_data?metric.done:0}" max="${metric.total||1}" aria-label="${escape(r.name+': '+detail)}"></progress></div></div>`;
    }).join('');
  }
  async function refresh() {
    const id=++request;
    if(!globalThis.PELEJA_ACCESS?.accessAllowed || !globalThis.PELEJA_ACCESS?.signedIn){rows=null;render();status.textContent='Entre na conta para comparar o progresso da turma.';return;}
    status.textContent='Atualizando…';
    try {
      const result=await globalThis.PELEJA_PROGRESS.load(day());
      if(id!==request)return;
      rows=result;render();
      status.textContent=globalThis.PELEJA_STORAGE.snapshot().dirty?'Mostrando dados da nuvem; há alterações locais aguardando envio.':'';
    }catch(error){if(id!==request)return;rows=null;render();status.textContent='Não foi possível carregar o comparativo. Tente atualizar.';}
  }
  panel.addEventListener('click',event=>{const b=event.target.closest('[data-progress-kind]');if(b){kind=b.dataset.progressKind;render();}});
  scope.addEventListener('change',render);
  document.getElementById('refreshStudyProgress').onclick=async()=>{const b=document.getElementById('refreshStudyProgress');b.disabled=true;try{if(globalThis.PELEJA_PROGRESS?.sync)await globalThis.PELEJA_PROGRESS.sync();await refresh();}finally{b.disabled=false;}};
  window.addEventListener('peleja:access-changed',()=>{rows=null;render();refresh();});
  window.addEventListener('peleja:storage-changed',()=>{rows=null;render();refresh();});
  window.addEventListener('peleja:workspace-synced',refresh);
  window.addEventListener('peleja:data-changed',()=>{if(rows)status.textContent='Mostrando dados da nuvem; aguardando envio das alterações locais.';});
  window.addEventListener('peleja:view-changed',e=>{if(e.detail?.view==='dashboard')refresh();});
  window.addEventListener('focus',()=>{if(document.getElementById('dashboardView').classList.contains('active'))refresh();});
  render();refresh();
})();
