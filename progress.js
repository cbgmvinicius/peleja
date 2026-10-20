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
    hint.textContent=kind==='courses'?'Aulas vistas em todo o CardioPapers, incluindo extras.':next?'Próxima prova pendente de cada pessoa. Provas na mesma data são somadas, sem repetir apostilas.':'Apostilas ligadas a provas de hoje em diante ou sem data, ainda não realizadas por cada pessoa.';
    if(!rows){list.innerHTML='';return;}
    list.innerHTML=rows.map(r=>{
      const metric=kind==='courses'?r.courses:next?r.next:r.materials;
      const percent=metric.total?Math.round(metric.done*100/metric.total):0;
      const detail=!r.has_data?'Ainda sem dados sincronizados':kind==='courses'?`${metric.done} de ${metric.total} aulas vistas`:next&&!metric.date?'Nenhuma próxima prova com data':!metric.total?'Nenhuma apostila vinculada neste recorte':`${metric.done} de ${metric.total} apostilas estudadas`;
      const exam=kind==='materials'&&next&&metric.date?`${new Date(metric.date+'T12:00:00').toLocaleDateString('pt-BR')} · ${(metric.exams||[]).join(' / ')}`:'';
      return `<div class="study-progress-row"><span class="study-avatar" aria-hidden="true">${escape(r.name.slice(0,1))}</span><div class="study-progress-copy"><div class="study-progress-title"><strong>${escape(r.name)}</strong><span>${r.has_data&&metric.total?percent+'%':'—'}</span></div><small>${escape(detail)}</small>${exam?`<small class="study-progress-exam">${escape(exam)}</small>`:''}<progress value="${r.has_data?metric.done:0}" max="${metric.total||1}" aria-label="${escape(r.name+': '+detail)}"></progress></div></div>`;
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
      status.textContent=globalThis.PELEJA_STORAGE.snapshot().dirty?'Mostrando dados da nuvem; há alterações locais aguardando envio.':'Dados sincronizados · atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    }catch(error){if(id!==request)return;rows=null;render();status.textContent='Não foi possível carregar o comparativo. Tente atualizar.';}
  }
  panel.addEventListener('click',event=>{const b=event.target.closest('[data-progress-kind]');if(b){kind=b.dataset.progressKind;render();}});
  scope.addEventListener('change',render);
  document.getElementById('refreshStudyProgress').onclick=refresh;
  window.addEventListener('peleja:access-changed',()=>{rows=null;render();refresh();});
  window.addEventListener('peleja:storage-changed',()=>{rows=null;render();refresh();});
  window.addEventListener('peleja:workspace-synced',refresh);
  window.addEventListener('peleja:data-changed',()=>{if(rows)status.textContent='Mostrando dados da nuvem; aguardando envio das alterações locais.';});
  window.addEventListener('peleja:view-changed',e=>{if(e.detail?.view==='dashboard')refresh();});
  window.addEventListener('focus',()=>{if(document.getElementById('dashboardView').classList.contains('active'))refresh();});
  render();refresh();
})();
