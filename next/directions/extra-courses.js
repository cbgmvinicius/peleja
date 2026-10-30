// Course catalog and progress are isolated from the live application.
let extraEnglishView='simple';
const extraChapterState=new Map();
function englishModules(view){
 const lookup=new Map(PELEJA_ENGLISH.lessons.map(l=>[l.id,l]));
 const stages=PELEJA_ENGLISH.views[view].flatMap(stage=>{
  if(stage.id==='simple-4'||stage.id==='classic-5')return [{...stage,modules:[{id:view+'-output-38',title:'Módulo 38',lessons:stage.modules.flatMap(m=>m.lessons)}]}];
  if(view!=='simple'||!stage.title.includes('Grammar & Pronunciation'))return [{...stage,modules:[...stage.modules]}];
  const pronunciation=id=>{const title=lookup.get(id)?.title||'';return !/Grammar/i.test(title)&&/Pronunciation|pronúncia/i.test(title)};
  return [{...stage,title:'03 - Grammar',modules:stage.modules.map(m=>({...m,id:m.id+'-grammar',lessons:m.lessons.filter(id=>!pronunciation(id))})).filter(m=>m.lessons.length)},
   {...stage,title:'04 - Pronunciation',modules:stage.modules.map(m=>({...m,id:m.id+'-pronunciation',lessons:m.lessons.filter(pronunciation)})).filter(m=>m.lessons.length)}];
 });
 if(view==='simple'){
  const destination=stages.find(stage=>stage.title==='04 - Pronunciation');
  for(const stage of stages){
   if(stage===destination)continue;
   const moved=stage.modules.filter(module=>['simple-3-1','simple-3-2'].includes(module.id));
   if(moved.length&&destination){destination.modules.push(...moved);stage.modules=stage.modules.filter(module=>!moved.includes(module));}
  }
 }
 return stages.flatMap(stage=>stage.modules.map(module=>({id:module.id,title:module.title,stage:view==='simple'?stage.title.replace('04 - Monolingual','05 - Monolingual').replace('05 - Output Practice','06 - Output Practice'):stage.title,lessons:module.lessons.map(id=>lookup.get(id)).filter(Boolean)})));
}
const extraCatalog={
 cardio:{title:'CardioPapers ECG',subtitle:'ECG',modules:PELEJA_COURSES.modules.map((m,i)=>({...m,title:`${String(i+1).padStart(2,'0')} · ${m.title}`,lessons:m.lessons.map((l,j)=>({...l,title:`${String(j+1).padStart(2,'0')} · ${l.title}`}))}))},
 english:{title:'Mairo Vergara',subtitle:'Inglês',modules:englishModules(extraEnglishView)}
};
const extraWatched={cardio:new Set(),english:new Set()};let extraActive=null,extraQuery='',extraPending=false,extraExpanded=new Set();
const scheduledExtra=PELEJA_COURSES.modules.filter(m=>m.scheduled).flatMap(m=>m.lessons),extraAnchor=scheduledExtra.findIndex(l=>l.id===PELEJA_COURSES.anchorLesson);
const extraDates=new Map(scheduledExtra.map((lesson,i)=>[lesson.id,new Date(Date.parse(PELEJA_COURSES.anchorDate+'T12:00:00Z')+(i-extraAnchor)*86400000).toISOString().slice(0,10)]));
const extraHeart='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6c-2.4-2.4-6.2-1.7-8.8 1.4-2.6-3.1-6.4-3.8-8.8-1.4C-1.4 9.2 5.4 16 12 21c6.6-5 13.4-11.8 8.8-16.4Z"/><path d="M3 12h5l2-4 3 8 2-4h6"/></svg>';
app.querySelector('main').insertAdjacentHTML('beforeend','<section id="extraPage" aria-label="Cursos extras" hidden></section>');
function extraAllowed(key){return key==='cardio'||canEditDemoStructure();}
function hideExtraCourses(){$('extraPage').hidden=true;$('navCourses').classList.remove('selected');$('navCourses').removeAttribute('aria-current');}
function showExtraCourses(){if(typeof hideDashboard==='function')hideDashboard();closeMenus();closeFacultyMenu();hideMockPages();$('libraryPage').hidden=$('facultyPage').hidden=true;$('facultyDemo').hidden=true;for(const id of ['navLibrary','navFaculty']){$(id).classList.remove('selected');$(id).removeAttribute('aria-current');}extraActive=null;$('extraPage').hidden=false;$('navCourses').classList.add('selected');$('navCourses').setAttribute('aria-current','page');renderExtraLanding();}
function renderExtraLanding(){
 $('extraPage').innerHTML=`<div class="extra-tiles">${Object.entries(extraCatalog).filter(([key])=>extraAllowed(key)).map(([key,course])=>{const total=course.modules.flatMap(m=>m.lessons).length,seen=extraWatched[key].size;return `<button type="button" class="extra-tile" data-extra-open="${key}"><span class="extra-symbol"><img src="../assets/${key==='cardio'?'cardiopapers-refined.png':'cimv-logo.png'}" alt="" width="48" height="48"></span><span class="extra-tile-copy"><strong>${course.title}</strong><span>${seen} / ${total} aulas</span><span class="extra-tile-track"><i style="width:${seen/total*100}%"></i></span></span><span class="extra-arrow" aria-hidden="true">↗</span></button>`;}).join('')}</div>`;
}
function extraLessons(){return extraCatalog[extraActive].modules.flatMap(m=>m.lessons);}
function extraIsPending(lesson){return !extraWatched[extraActive].has(lesson.id)&&(extraActive==='english'||(extraDates.has(lesson.id)&&extraDates.get(lesson.id)<=localQuestionDate()));}
function updateExtraProgress(){
 if(!extraActive)return;const total=extraLessons().length,seen=extraWatched[extraActive].size,pending=extraLessons().filter(extraIsPending).length;
 $('extraProgressLabel').textContent=`${seen} / ${total} aulas`;$('extraProgressPercent').textContent=Math.round(seen/total*100)+'%';$('extraProgress').style.width=seen/total*100+'%';$('extraProgressBar').setAttribute('aria-valuenow',seen);$('extraPendingCount').textContent=extraActive==='cardio'?(pending?`${pending} pendentes até hoje`:'Em dia'):'';
 for(const module of extraCatalog[extraActive].modules){const element=[...$('extraModules').querySelectorAll('[data-module-count]')].find(el=>el.dataset.moduleCount===module.id);if(element)element.textContent=`${module.lessons.filter(l=>extraWatched[extraActive].has(l.id)).length}/${module.lessons.length}`;}
}
function renderExtraModules(animateFilter=false){
 const oldPanels=new Map(animateFilter?[...$('extraModules').querySelectorAll('.extra-module')].map(panel=>[panel.dataset.extraModule,panel.getBoundingClientRect().height]):[]);
 const hadContent=!!$('extraModules')?.children.length;
 const query=extraQuery.trim().toLocaleLowerCase('pt-BR'),watched=extraWatched[extraActive];let previousStage='';
 $('extraModules').innerHTML=extraCatalog[extraActive].modules.map(module=>{const lessons=module.lessons.filter(l=>(!extraPending||extraIsPending(l))&&(!query||`${l.code||''} ${l.title} ${module.title}`.toLocaleLowerCase('pt-BR').includes(query)));if(!lessons.length)return '';const heading=module.stage&&module.stage!==previousStage?`<h3 class="extra-stage">${escapeHtml(module.stage)}</h3>`:'';previousStage=module.stage;return `${heading}<details class="extra-module" data-extra-module="${module.id}" ${extraExpanded.has(module.id)||query||extraPending?'open':''}><summary data-course-motion="module-${module.id}"><span class="extra-module-title">${escapeHtml(module.title)}</span><span class="extra-module-count" data-module-count="${module.id}"></span><span class="extra-module-chevron" aria-hidden="true">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg>'}</span></summary><div class="extra-lessons">${lessons.map(l=>{const seen=watched.has(l.id),date=extraActive==='cardio'?extraDates.get(l.id):null;return `<div class="extra-lesson${seen?' is-watched':''}" data-extra-row="${l.id}" data-course-motion="lesson-${l.id}"><span class="extra-lesson-copy"><strong>${escapeHtml(l.title)}</strong>${date||l.code?`<span>${l.code?escapeHtml(l.code):new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}${date===localQuestionDate()?' · Hoje':''}</span>`:''}</span><button type="button" class="extra-check" data-extra-check="${l.id}" aria-pressed="${seen}" aria-label="${seen?'Desmarcar':'Marcar como vista'}: ${escapeHtml(l.title)}" title="${seen?'Vista':'Marcar como vista'}">${seen?svg('check'):'<span class="extra-check-empty" aria-hidden="true"></span>'}</button></div>`;}).join('')}</div></details>`;}).join('')||'<p class="extra-empty">Nenhuma aula neste recorte.</p>';
 if(extraActive==='english'){
  for(const heading of [...$('extraModules').querySelectorAll('.extra-stage')]){
   const title=heading.textContent,key=extraEnglishView+':'+title,panel=document.createElement('details');panel.className='extra-chapter';panel.dataset.extraChapter=key;
   const body=document.createElement('div');body.className='extra-chapter-body';
   while(heading.nextElementSibling&&!heading.nextElementSibling.classList.contains('extra-stage'))body.append(heading.nextElementSibling);
   panel.open=!!query||extraPending||(extraChapterState.has(key)?extraChapterState.get(key):!!body.querySelector('details[open]'));
   panel.innerHTML=`<summary><span class="extra-stage">${escapeHtml(title)}</span><span class="extra-chapter-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m8 10 4 4 4-4"/></svg></span></summary>`;
   panel.append(body);heading.replaceWith(panel);
  }
 }
 updateExtraProgress();
 if(animateFilter&&!reduceMotion()){
  const panels=[...$('extraModules').querySelectorAll('.extra-module')].map(panel=>({panel,expand:panel.open,end:panel.getBoundingClientRect().height,start:oldPanels.get(panel.dataset.extraModule)??panel.querySelector('summary').getBoundingClientRect().height}));
  for(const {panel,expand,start,end} of panels){
   if(Math.abs(start-end)<1)continue;
   panel.open=true;panel.style.overflow='hidden';panel.dataset.expanded=String(expand);
   const finish=()=>{panel.open=expand;panel.style.overflow='';delete panel.dataset.expanded;extraModuleAnimations.delete(panel);};
   const animation=motion(panel,[{height:start+'px'},{height:end+'px'}],{duration:320,easing:'cubic-bezier(.22,.8,.25,1)'});
   if(animation){extraModuleAnimations.set(panel,{animation,expand});animation.onfinish=finish;}else finish();
  }
 }else if(hadContent)motion($('extraModules'),[{opacity:.7},{opacity:1}],{duration:200,easing:'ease-out'});
}
function openExtraCourse(key){
 if(!extraAllowed(key))return;extraActive=key;extraQuery='';extraPending=false;extraExpanded=new Set();const course=extraCatalog[key],today=localQuestionDate();
 const next=key==='cardio'?course.modules.find(m=>m.lessons.some(l=>extraDates.get(l.id)===today)):null;extraExpanded.add((next||course.modules.find(m=>m.lessons.some(l=>!extraWatched[key].has(l.id)))||course.modules[0]).id);
 $('extraPage').innerHTML=`<button type="button" class="extra-back" id="extraBack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 7-5 5 5 5"/></svg><span>Cursos extras</span></button><div class="extra-heading"><div><span class="editor-kicker">${course.subtitle}</span><h2>${course.title}</h2></div><div class="extra-progress"><div><span id="extraProgressLabel"></span><span id="extraProgressPercent"></span></div><div id="extraProgressBar" class="extra-progress-track" role="progressbar" aria-label="Aulas vistas" aria-valuemin="0" aria-valuemax="${extraLessons().length}"><i id="extraProgress"></i></div><span id="extraPendingCount"></span></div></div>${key==='english'?`<div id="extraViewTabs" class="sliding-tabs extra-view-tabs" style="--tab-count:2;--tab-index:${extraEnglishView==='classic'?0:1}" role="group" aria-label="Organização do curso"><span class="sliding-thumb" aria-hidden="true"></span><button type="button" data-extra-view="classic" aria-pressed="${extraEnglishView==='classic'}">Original</button><button type="button" data-extra-view="simple" aria-pressed="${extraEnglishView==='simple'}">Alternativa</button></div>`:''}<div class="extra-tools"><label class="search">${svg('search')}<input id="extraSearch" type="search" placeholder="Buscar aula" aria-label="Buscar aula"></label><label class="switch-option"><span>${key==='cardio'?'Só pendentes':'Não vistas'}</span><input id="extraPending" type="checkbox" role="switch"><span class="switch-visual" aria-hidden="true"></span></label><button type="button" class="editor-cancel" id="extraResume">${key==='cardio'&&extraLessons().some(l=>extraDates.get(l.id)===today)?'Aula de hoje':'Continuar'}</button></div><div id="extraModules"></div>`;
 $('extraBack').onclick=()=>{extraActive=null;renderExtraLanding();};$('extraSearch').oninput=()=>{extraQuery=$('extraSearch').value;renderExtraModules();};$('extraPending').onchange=()=>{extraPending=$('extraPending').checked;renderExtraModules(true);};$('extraResume').onclick=resumeExtraCourse;renderExtraModules();
}
const extraModuleAnimations=new WeakMap();
function toggleExtraModule(panel){const old=extraModuleAnimations.get(panel),expand=old?!old.expand:!panel.open,start=panel.getBoundingClientRect().height;old?.animation?.cancel();panel.open=true;panel.style.overflow='hidden';const end=expand?panel.scrollHeight:panel.querySelector('summary').getBoundingClientRect().height;panel.dataset.expanded=String(expand);const finish=()=>{panel.open=expand;panel.style.overflow='';delete panel.dataset.expanded;extraModuleAnimations.delete(panel);};if(panel.dataset.extraChapter)extraChapterState.set(panel.dataset.extraChapter,expand);else expand?extraExpanded.add(panel.dataset.extraModule):extraExpanded.delete(panel.dataset.extraModule);const animation=motion(panel,[{height:start+'px'},{height:end+'px'}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});if(animation){extraModuleAnimations.set(panel,{animation,expand});animation.onfinish=finish;}else finish();}
function resumeExtraCourse(){const lessons=extraLessons(),today=localQuestionDate(),target=(extraActive==='cardio'?lessons.find(l=>extraDates.get(l.id)===today):null)||lessons.find(l=>!extraWatched[extraActive].has(l.id));if(!target)return;extraPending=false;extraQuery='';$('extraPending').checked=false;$('extraSearch').value='';const module=extraCatalog[extraActive].modules.find(m=>m.lessons.some(l=>l.id===target.id));extraExpanded.add(module.id);if(module.stage)extraChapterState.set(extraEnglishView+':'+module.stage,true);renderExtraModules();const button=[...$('extraModules').querySelectorAll('[data-extra-check]')].find(b=>b.dataset.extraCheck===target.id);button?.scrollIntoView?.({block:'center',behavior:reduceMotion()?'auto':'smooth'});button?.focus({preventScroll:true});}
$('extraPage').onclick=event=>{
 const viewButton=event.target.closest('[data-extra-view]');if(viewButton&&extraActive==='english'){
 extraEnglishView=viewButton.dataset.extraView;extraCatalog.english.modules=englishModules(extraEnglishView);extraExpanded=new Set();
 const next=extraCatalog.english.modules.find(m=>m.lessons.some(l=>!extraWatched.english.has(l.id)));if(next)extraExpanded.add(next.id);
 $('extraViewTabs').style.setProperty('--tab-index',extraEnglishView==='classic'?0:1);$('extraViewTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.extraView===extraEnglishView)));renderExtraModules();return;
 }
 const enter=event.target.closest('[data-extra-open]');if(enter){openExtraCourse(enter.dataset.extraOpen);return;}const summary=event.target.closest('.extra-module>summary,.extra-chapter>summary');if(summary){event.preventDefault();toggleExtraModule(summary.parentElement);return;}
 const button=event.target.closest('[data-extra-check]');if(!button||!extraActive||!extraAllowed(extraActive))return;const id=button.dataset.extraCheck;if(!extraLessons().some(l=>l.id===id))return;const watched=extraWatched[extraActive],seen=!watched.has(id);seen?watched.add(id):watched.delete(id);clearStudyEffects(button);button.setAttribute('aria-pressed',String(seen));button.title=seen?'Vista':'Marcar como vista';const lesson=extraLessons().find(l=>l.id===id);button.setAttribute('aria-label',`${seen?'Desmarcar':'Marcar como vista'}: ${lesson.title}`);button.innerHTML=seen?svg('check'):'<span class="extra-check-empty" aria-hidden="true"></span>';button.closest('.extra-lesson').classList.toggle('is-watched',seen);if(seen)celebrateStudy(button,button);updateExtraProgress();
 if(extraPending&&seen){const row=button.closest('.extra-lesson'),course=extraActive;const finish=()=>{if(extraActive!==course||!row.isConnected)return;renderExtraModules();($('extraModules').querySelector('[data-extra-check]')||$('extraPending')).focus();};const anim=motion(row,[{opacity:1},{opacity:0}],{duration:220,easing:'ease-out'});if(anim)anim.onfinish=finish;else finish();}
};
function resetExtraCourses(){extraWatched.cardio.clear();extraWatched.english.clear();if(!$('extraPage').hidden){if(extraActive)openExtraCourse(extraActive);else renderExtraLanding();}}
function syncExtraAccess(){if(!$('extraPage').hidden){if(extraActive&&!extraAllowed(extraActive)){extraActive=null;renderExtraLanding();}else if(!extraActive)renderExtraLanding();}}
$('navCourses').onclick=showExtraCourses;
