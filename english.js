/* CIMV catalog with account-private progress; both views share the same lesson IDs. */
(() => {
 const catalog=globalThis.PELEJA_ENGLISH,store=globalThis.PELEJA_STORAGE;
 const key='medstudy_courses_v1',prefKey='peleja_preferences_v1',root=document.getElementById('extraCourses');
 const byId=new Map(catalog.lessons.map(l=>[l.id,l]));
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const allowed=()=>store.isLocalOwner||globalThis.PELEJA_ACCESS?.isAdmin===true;
 const prefs=()=>JSON.parse(store.getItem(prefKey)||'{}');
 const records=()=>JSON.parse(store.getItem(key)||'[]');
 let query='',pending=false,expanded=new Set(),owner=null;
 const watched=()=>new Set(records().filter(r=>byId.has(r.id)).map(r=>r.id));
 const current=done=>byId.get(prefs().englishCurrent)||catalog.lessons.find(l=>!done.has(l.id));
 const announce=()=>window.dispatchEvent(new CustomEvent('peleja:data-changed',{detail:{kind:'courses'}}));
 function render(){
  if(!allowed())return;
  if(owner!==store.scope){owner=store.scope;query='';pending=false;expanded=new Set();}
  const done=watched(),next=current(done),view=prefs().englishView==='classic'?'classic':'simple';
  const match=l=>(!pending||!done.has(l.id))&&(!query||`${l.code} ${l.title}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const row=l=>`<div class="english-lesson"><label class="course-lesson${done.has(l.id)?' is-watched':''}"><input type="checkbox" data-english-lesson="${l.id}" ${done.has(l.id)?'checked':''} ${store.writable?'':'disabled'}><span class="course-lesson-copy"><strong>${escape(l.title)}</strong><small>${escape(l.code)}${next?.id===l.id?' · Aula atual':''}</small></span></label><button type="button" class="icon-button english-pin" data-english-current="${l.id}" title="Continuar daqui" aria-label="Continuar daqui: ${escape(l.code)}">↳</button></div>`;
  root.innerHTML=`<button type="button" class="text-button course-back" id="backToCourses">← Cursos extras</button><article class="panel english-overview"><div><h2>Mairo Vergara</h2><span>${done.size} de ${catalog.lessons.length} aulas vistas</span></div>${next?`<button type="button" class="ghost-button" id="englishResume">Retomar ${escape(next.code)}</button>`:''}<progress max="${catalog.lessons.length}" value="${done.size}" aria-label="Progresso no inglês"></progress></article><div class="toolbar english-tools"><input type="search" id="englishSearch" aria-label="Buscar aula de inglês" placeholder="Buscar aula…" value="${escape(query)}"><select id="englishView" aria-label="Organização do inglês"><option value="simple" ${view==='simple'?'selected':''}>Simplificada</option><option value="classic" ${view==='classic'?'selected':''}>Original</option></select><label><input id="englishPending" type="checkbox" ${pending?'checked':''}> Não vistas</label></div><div class="course-modules">${catalog.views[view].map(stage=>{
    const ids=stage.modules.flatMap(m=>m.lessons),modules=stage.modules.map(module=>{const visible=module.lessons.map(id=>byId.get(id)).filter(match);return visible.length?`<details class="english-module" data-english-group="${module.id}" ${query||expanded.has(module.id)?'open':''}><summary><span>${escape(module.title)}</span><small>${module.lessons.filter(id=>done.has(id)).length}/${module.lessons.length}</small></summary>${visible.map(row).join('')}</details>`:'';}).join('');
    return modules?`<details class="panel course-module" data-english-group="${stage.id}" ${query||expanded.has(stage.id)?'open':''}><summary><span>${escape(stage.title)}</span><small>${ids.filter(id=>done.has(id)).length}/${ids.length}</small></summary>${modules}</details>`:'';
  }).join('')||'<p class="panel">Nenhuma aula neste filtro.</p>'}</div>`;
  document.getElementById('englishSearch').oninput=e=>{const position=e.target.selectionStart;query=e.target.value;remember();render();const input=document.getElementById('englishSearch');input.focus();if(position!==null)try{input.setSelectionRange(position,position);}catch{}};
  document.getElementById('englishView').onchange=e=>{store.setItem(prefKey,JSON.stringify({...prefs(),englishView:e.target.value}));expanded.clear();announce();};
  document.getElementById('englishPending').onchange=e=>{pending=e.target.checked;remember();render();};
  const resume=document.getElementById('englishResume');if(resume)resume.onclick=()=>{query='';pending=false;for(const stage of catalog.views[view])for(const module of stage.modules)if(module.lessons.includes(next.id)){expanded.add(stage.id);expanded.add(module.id);}render();const el=root.querySelector(`[data-english-lesson="${next.id}"]`);el.scrollIntoView({block:'center'});el.focus({preventScroll:true});};
 }
 function remember(){expanded=new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.englishGroup));}
 root.addEventListener('change',e=>{
  const input=e.target.closest('[data-english-lesson]');if(!input||!allowed()||!store.writable)return;
  const id=input.dataset.englishLesson;if(!byId.has(id))return;remember();
  const before=watched(),next=records().filter(r=>r.id!==id);if(input.checked)next.push({id,watchedAt:new Date().toISOString()});
  const wasCurrent=current(before)?.id===id;store.setItem(key,JSON.stringify(next));
  if(input.checked&&wasCurrent){const after=watched(),index=catalog.lessons.findIndex(l=>l.id===id);const following=catalog.lessons.slice(index+1).find(l=>!after.has(l.id))||catalog.lessons.find(l=>!after.has(l.id));store.setItem(prefKey,JSON.stringify({...prefs(),englishCurrent:following?.id||null}));}
  announce();(root.querySelector(`[data-english-lesson="${id}"]`)||document.getElementById('englishPending')).focus();
 });
 root.addEventListener('click',e=>{const pin=e.target.closest('[data-english-current]');if(!pin||!allowed()||!store.writable||!byId.has(pin.dataset.englishCurrent))return;remember();store.setItem(prefKey,JSON.stringify({...prefs(),englishCurrent:pin.dataset.englishCurrent}));announce();root.querySelector(`[data-english-current="${pin.dataset.englishCurrent}"]`)?.focus();});
 globalThis.PELEJA_ENGLISH_UI={render,allowed,count:()=>watched().size,total:catalog.lessons.length};
})();
