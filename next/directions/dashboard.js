// Isolated dashboard. Peer progress below is illustrative, never fetched or synced.
let dashboardCourse='subjects',dashboardNextOnly=false;
function seedDashboardExams(){
 const day=offset=>{const d=new Date(localQuestionDate()+'T12:00:00');d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 for(const [index,subject] of ['Clínica Médica III','Pediatria'].entries())facultyRecords.push({id:'demo-panel-'+index,type:'PR2.1',subject,date:day(index?5:2),materialCodes:data.filter(m=>m.subject===subject).map(m=>m.code),q:null,c:null,w:null});
}
seedDashboardExams();
app.querySelector('main').insertAdjacentHTML('beforeend','<section id="dashboardPage" aria-label="Painel" hidden></section>');
function hideDashboard(){if(!$('dashboardPage'))return;$('dashboardPage').hidden=true;$('navDashboard').classList.remove('selected');$('navDashboard').removeAttribute('aria-current');}
function showDashboard(){closeMenus();closeFacultyMenu();hideMockPages();hideExtraCourses();$('libraryPage').hidden=$('facultyPage').hidden=true;$('facultyDemo').hidden=true;for(const id of ['navLibrary','navFaculty']){$(id).classList.remove('selected');$(id).removeAttribute('aria-current');}$('dashboardPage').hidden=false;$('navDashboard').classList.add('selected');$('navDashboard').setAttribute('aria-current','page');renderDashboard();}
function dashboardUpcoming(){return facultyRecords.filter(e=>(!e.date||e.date>=localQuestionDate())&&!isFacultyPerformed(e)).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));}
function dashboardSubjectCodes(){const exams=dashboardUpcoming(),selected=dashboardNextOnly?exams.slice(0,1):exams;return [...new Set(selected.flatMap(e=>e.materialCodes))].filter(code=>data.some(m=>m.code===code));}
function dashboardProgress(){
 const codes=dashboardSubjectCodes(),total=dashboardCourse==='subjects'?codes.length:scheduledExtra.filter(l=>extraDates.get(l.id)<=localQuestionDate()).length;
 if(!total)return '<p class="dashboard-empty">Nenhuma pendência neste recorte.</p>';
 const ids=dashboardCourse==='subjects'?codes:scheduledExtra.filter(l=>extraDates.get(l.id)<=localQuestionDate()).map(l=>l.id);
 const peers=[{name:'Wilton',index:0},{name:'Ulisses',index:1},{name:'Jonas',index:2}].map(p=>({...p,done:ids.filter((id,i)=>((i+p.index)%4)!==3&&((i+p.index)%5)!==2).length}));
 const own={name:'Vinícius',me:true,done:dashboardCourse==='subjects'?data.filter(m=>codes.includes(m.code)&&m.studied).length:ids.filter(id=>extraWatched.cardio.has(id)).length};
 const rows=[...peers,own].sort((a,b)=>b.done-a.done||a.name.localeCompare(b.name,'pt-BR'));
 return `<ol class="dashboard-ranking">${rows.map(p=>{const rank=rows.findIndex(r=>r.done===p.done)+1,pct=Math.round(p.done/total*100);return `<li data-person="${escapeHtml(p.name)}" class="${p.me?'is-me':''}"><span class="dashboard-place">${rank}º</span><span class="ranking-person">${mockPersonAvatar(p)}<span>${escapeHtml(p.name)}${p.me?'<small>Você</small>':''}</span></span><span class="dashboard-completion"><strong><b data-count="${p.done}">${p.done}</b><span> / <b data-count="${total}">${total}</b></span></strong><span class="dashboard-track" role="img" aria-label="${pct}% concluído"><i style="width:${pct}%"></i></span></span></li>`;}).join('')}</ol>`;
}
function renderDashboard(){
 if(!$('dashboardPage')||$('dashboardPage').hidden)return;
 const next=dashboardUpcoming()[0],topics=next?next.materialCodes.map(code=>data.find(m=>m.code===code)).filter(Boolean):[],pending=topics.filter(m=>!m.studied),done=topics.length-pending.length;
 const overdue=scheduledExtra.filter(l=>extraDates.get(l.id)<=localQuestionDate()&&!extraWatched.cardio.has(l.id));
 const nextDate=next?.date?new Date(next.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short'}):'';
 $('dashboardPage').innerHTML=`<div class="dashboard-grid"><section class="dashboard-card dashboard-next"><div class="dashboard-card-heading"><h2>Próxima prova</h2><button class="icon" data-dashboard-exams aria-label="Ver provas" title="Ver provas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button></div>${next?`<div class="dashboard-exam-heading"><span class="faculty-tag">${escapeHtml(next.type)}</span><span>${nextDate||'Sem data'}</span></div><h3>${escapeHtml(next.subject)}</h3><div class="dashboard-study-progress"><span>${done} de ${topics.length} assuntos estudados</span><span class="dashboard-track"><i style="width:${topics.length?done/topics.length*100:0}%"></i></span></div><div class="dashboard-topics">${pending.slice(0,3).map(m=>`<button data-dashboard-topic="${escapeHtml(m.code)}"><span>${escapeHtml((m.fullTitle||m.code+' '+m.title).toLocaleUpperCase('pt-BR'))}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 6 6 6-6 6"/></svg></button>`).join('')}</div>${pending.length>3?`<button class="dashboard-more" data-dashboard-exams>Ver ${pending.length} pendentes</button>`:!pending.length?`<p class="dashboard-empty">${topics.length?'Tudo estudado para esta prova.':'Nenhum assunto vinculado.'}</p>`:''}`:'<p class="dashboard-empty">Nenhuma prova pendente agendada.</p>'}</section><section class="dashboard-card dashboard-course"><div class="dashboard-card-heading"><h2>CardioPapers</h2><button class="icon" data-dashboard-course="cardio" aria-label="Abrir CardioPapers" title="Abrir CardioPapers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m9 6 6 6-6 6"/></svg></button></div><div class="dashboard-course-count"><strong>${overdue.length}</strong><span>${overdue.length===1?'aula pendente':'aulas pendentes'}</span></div><div class="dashboard-course-lessons">${overdue.slice(0,3).map(l=>`<button data-dashboard-lesson="${l.id}"><span>${escapeHtml(l.title)}</span><span>${new Date(extraDates.get(l.id)+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</span></button>`).join('')}</div>${overdue.length>3?`<button class="dashboard-more" data-dashboard-pending>Ver todas · ${overdue.length}</button>`:!overdue.length?'<p class="dashboard-empty">Em dia.</p>':''}${extraAllowed('english')?`<button class="dashboard-english" data-dashboard-course="english"><img src="../assets/cimv-logo.png" alt=""><span>Mairo Vergara</span><span>${extraWatched.english.size}/${PELEJA_ENGLISH.lessons.length}</span></button>`:''}</section></div><section class="dashboard-card dashboard-comparison"><div class="dashboard-comparison-controls"><div class="sliding-tabs" style="--tab-count:2;--tab-index:${dashboardCourse==='subjects'?0:1}" role="group" aria-label="Comparar progresso"><span class="sliding-thumb" aria-hidden="true"></span><button data-dashboard-tab="subjects" aria-pressed="${dashboardCourse==='subjects'}">Assuntos</button><button data-dashboard-tab="cardio" aria-pressed="${dashboardCourse==='cardio'}">CardioPapers</button></div><label class="switch-option" ${dashboardCourse==='subjects'?'':'hidden'}><span>Próxima prova</span><input id="dashboardNextOnly" role="switch" type="checkbox" ${dashboardNextOnly?'checked':''}><span class="switch-visual" aria-hidden="true"></span></label></div><div class="dashboard-comparison-context"><span>${dashboardCourse==='subjects'?(dashboardNextOnly?'Próxima prova':'Provas pendentes'):'Até hoje'}</span><span>Comparativo ilustrativo</span></div><div id="dashboardRanking">${dashboardProgress()}</div></section>`;
 $('dashboardNextOnly').onchange=event=>{dashboardNextOnly=event.target.checked;updateDashboardComparison();};
}
let dashboardRankingFrame=0;
function transitionDashboardRanking(html){
 const host=$('dashboardRanking'),template=document.createElement('div');template.innerHTML=html;
 const list=host.querySelector('.dashboard-ranking'),target=template.querySelector('.dashboard-ranking');
 if(!list||!target){cancelAnimationFrame(dashboardRankingFrame);host.innerHTML=html;return;}
 const old=new Map([...list.children].map(row=>[row.dataset.person,{row,top:row.getBoundingClientRect().top}]));
 cancelAnimationFrame(dashboardRankingFrame);
 const counts=[];
 for(const desired of [...target.children]){
  const existing=old.get(desired.dataset.person);
  if(!existing){list.append(desired);continue;}
  const row=existing.row;
  row.getAnimations?.().forEach(a=>a.cancel());
  row.querySelector('.dashboard-place').textContent=desired.querySelector('.dashboard-place').textContent;
  const values=[...desired.querySelectorAll('[data-count]')];
  row.querySelectorAll('[data-count]').forEach((node,i)=>{counts.push({node,from:Number(node.textContent),to:Number(values[i].dataset.count)});node.dataset.count=values[i].dataset.count;});
  const bar=row.querySelector('.dashboard-track');
  bar.setAttribute('aria-label',desired.querySelector('.dashboard-track').getAttribute('aria-label'));
  bar.firstElementChild.style.width=desired.querySelector('.dashboard-track i').style.width;
  list.append(row);
 }
 for(const [name,{row}] of old)if(![...target.children].some(r=>r.dataset.person===name))row.remove();
 for(const {row,top} of old.values())if(row.isConnected){const dy=top-row.getBoundingClientRect().top;if(dy)motion(row,[{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:380,easing:'cubic-bezier(.22,.8,.25,1)'});}
 if(reduceMotion()){counts.forEach(c=>c.node.textContent=c.to);return;}
 const start=performance.now();
 const tick=now=>{const t=Math.min(1,(now-start)/380),ease=1-Math.pow(1-t,3);counts.forEach(c=>c.node.textContent=Math.round(c.from+(c.to-c.from)*ease));if(t<1&&host.isConnected)dashboardRankingFrame=requestAnimationFrame(tick);};
 dashboardRankingFrame=requestAnimationFrame(tick);
}
function updateDashboardComparison(){
 const panel=$('dashboardPage'),tabs=panel.querySelector('.sliding-tabs');tabs.style.setProperty('--tab-index',dashboardCourse==='subjects'?0:1);
 tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dashboardTab===dashboardCourse)));
 $('dashboardNextOnly').closest('label').hidden=dashboardCourse!=='subjects';$('dashboardNextOnly').disabled=dashboardCourse!=='subjects';
 panel.querySelector('.dashboard-comparison-context>span').textContent=dashboardCourse==='subjects'?(dashboardNextOnly?'Próxima prova':'Provas pendentes'):'Até hoje';
 transitionDashboardRanking(dashboardProgress());
}
$('dashboardPage').onclick=event=>{
 const topic=event.target.closest('[data-dashboard-topic]');if(topic){revealFacultyTopic(topic.dataset.dashboardTopic);return;}
 if(event.target.closest('[data-dashboard-exams]')){showFacultyPage();return;}
 const tabButton=event.target.closest('[data-dashboard-tab]');if(tabButton){dashboardCourse=tabButton.dataset.dashboardTab;updateDashboardComparison();return;}
 const course=event.target.closest('[data-dashboard-course]'),lesson=event.target.closest('[data-dashboard-lesson]'),pending=event.target.closest('[data-dashboard-pending]');
 if(course||lesson||pending){showExtraCourses();openExtraCourse(course?.dataset.dashboardCourse||'cardio');if(pending){$('extraPending').checked=true;extraPending=true;renderExtraModules();}if(lesson){const id=lesson.dataset.dashboardLesson,module=extraCatalog.cardio.modules.find(m=>m.lessons.some(l=>l.id===id));extraExpanded.add(module.id);renderExtraModules();const button=[...$('extraModules').querySelectorAll('[data-extra-check]')].find(b=>b.dataset.extraCheck===id);button?.scrollIntoView?.({block:'center',behavior:reduceMotion()?'auto':'smooth'});button?.focus({preventScroll:true});}}
};
$('navDashboard').onclick=showDashboard;
showDashboard();
