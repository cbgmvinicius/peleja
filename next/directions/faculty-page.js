// Dates determine order; a recorded question result determines completion.
let facultyMenuId=null,facultyExpanded=new Set(),facultyDayTimer;
function isFacultyPerformed(exam){return exam.q!=null;}
function orderedFaculty(exams,today=localQuestionDate()){
  return [...exams].sort((a,b)=>{
    const pastA=a.date<today||a.sortCompleted===true,pastB=b.date<today||b.sortCompleted===true;
    if(pastA!==pastB)return Number(pastA)-Number(pastB);
    return (pastA?b.date.localeCompare(a.date):a.date.localeCompare(b.date))||a.subject.localeCompare(b.subject,'pt-BR');
  });
}
function closeFacultyMenu(){
  $('facultyMenu').hidden=true;document.querySelectorAll('[data-exam-menu]').forEach(b=>b.setAttribute('aria-expanded','false'));
}
function renderFacultyPage(){
  const before=captureListMotion($('facultyList'),'[data-exam]','data-exam');
  const exams=orderedFaculty(facultyRecords.map(e=>({...e,sortCompleted:e.q!=null||e.grade!=null})));
  $('facultyPageCount').textContent=`${exams.length} ${exams.length===1?'prova':'provas'}`;
  $('facultyList').innerHTML=exams.map(exam=>{
    const performed=isFacultyPerformed(exam),expanded=facultyExpanded.has(exam.id);
    const topics=exam.materialCodes.map(code=>data.find(m=>m.code===code)).filter(Boolean);

    const doneLabel=performed?'Editar meu resultado':'Adicionar meu resultado';
    return `<article class="faculty-card" data-exam="${exam.id}"><div><span class="faculty-tag">${escapeHtml(exam.type)}</span><h3>${escapeHtml(exam.subject)}</h3><span class="faculty-date">${escapeHtml(new Date(exam.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'}))}</span><div class="faculty-topics" id="topics-${exam.id}">${topics.map(m=>`<button class="faculty-topic" data-topic="${escapeHtml(m.code)}" title="${escapeHtml(m.fullTitle||m.code+' '+m.title)}">${escapeHtml((m.fullTitle||m.code+' '+m.title).toLocaleUpperCase('pt-BR'))}</button>`).join('')}</div><button class="faculty-more" data-exam-expand="${exam.id}" aria-controls="topics-${exam.id}" aria-expanded="${expanded}" hidden>${topics.length} assuntos</button></div>${exam.q!=null?`<div class="faculty-result"><div class="stats"><span>Questões<b>${exam.q}</b></span><span class="correct">Acertos<b>${exam.c}</b></span><span class="wrong">Erros<b>${exam.w}</b></span></div><span class="faculty-accuracy">${Math.round(exam.c/exam.q*100)}% de acertos</span></div>`:'<div class="faculty-no-result">Sem resultado</div>'}<div class="faculty-actions"><button class="icon" data-exam-menu="${exam.id}" aria-label="Ações de ${escapeHtml(exam.type+' · '+exam.subject)}" title="Mais ações" aria-haspopup="true" aria-expanded="false">${svg('more')}</button><button class="icon exam-result-action${performed?' has-result':''}" data-exam-result="${exam.id}" aria-label="${doneLabel}" title="${doneLabel}">${svg('target')}</button></div></article>`;
  }).join('');
  applyDemoPermissions();measureFacultyTopics();
  $('facultyEmpty').hidden=!!exams.length;$('facultyEmpty').querySelector('p').textContent='Nenhuma prova cadastrada.';
  playListMotion($('facultyList'),'[data-exam]','data-exam',before);
}
function showFacultyPage(){if(typeof hideDashboard==='function')hideDashboard();
  if(typeof hideExtraCourses==='function')hideExtraCourses();
  if(typeof hideMockPages==='function')hideMockPages();
  $('facultyDemo').hidden=false;
  closeMenus();closeFacultyMenu();$('libraryPage').hidden=true;$('facultyPage').hidden=false;
  $('navLibrary').classList.remove('selected');$('navLibrary').removeAttribute('aria-current');$('navFaculty').classList.add('selected');$('navFaculty').setAttribute('aria-current','page');renderFacultyPage();
}
function showLibraryPage(){if(typeof hideDashboard==='function')hideDashboard();
  if(typeof hideExtraCourses==='function')hideExtraCourses();
  if(typeof hideMockPages==='function')hideMockPages();
  $('facultyDemo').hidden=true;
  closeMenus();closeFacultyMenu();$('libraryPage').hidden=false;$('facultyPage').hidden=true;
  $('navFaculty').classList.remove('selected');$('navFaculty').removeAttribute('aria-current');$('navLibrary').classList.add('selected');$('navLibrary').setAttribute('aria-current','page');render();
}
$('navFaculty').onclick=showFacultyPage;$('navLibrary').onclick=showLibraryPage;
$('facultyCreate').onclick=()=>openFaculty();
$('facultyList').onclick=event=>{
  const menu=event.target.closest('[data-exam-menu]'),result=event.target.closest('[data-exam-result]'),expand=event.target.closest('[data-exam-expand]');
  if(menu){const open=$('facultyMenu').hidden||facultyMenuId!==menu.dataset.examMenu;closeFacultyMenu();closeMenus();facultyMenuId=menu.dataset.examMenu;if(open){$('facultyMenu').hidden=false;positionMenu($('facultyMenu'),menu);menu.setAttribute('aria-expanded','true');$('facultyMenuEdit').focus();}return;}
  if(result){closeFacultyMenu();openFaculty(result.dataset.examResult,{resultOnly:true});return;}
  if(expand){toggleFacultyTopics(expand);return;}
  const topic=event.target.closest('[data-topic]');if(topic)revealFacultyTopic(topic.dataset.topic);
};
$('facultyMenuEdit').onclick=()=>{const id=facultyMenuId;closeFacultyMenu();openFaculty(id);};
$('facultyMenuDelete').onclick=()=>{
  if(!canEditDemoStructure())return;
  const exam=facultyRecords.find(x=>x.id===facultyMenuId);if(!exam)return;
  confirmPeleja('Excluir prova?',()=>{
  facultyRecords=facultyRecords.filter(x=>x.id!==exam.id);facultyExpanded.delete(exam.id);closeFacultyMenu();renderFacultyPage();$('navFaculty').focus();toast('Prova excluída','trash');
  },{description:`${exam.type} · ${exam.subject}. O resultado registrado nesta prova também será removido.`,accept:'Excluir',destructive:true});
};
document.addEventListener('click',event=>{if(!event.target.closest('#facultyMenu,[data-exam-menu]'))closeFacultyMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('facultyMenu').hidden){const id=facultyMenuId;closeFacultyMenu();[...document.querySelectorAll('[data-exam-menu]')].find(b=>b.dataset.examMenu===id)?.focus();}});
function scheduleFacultyDay(){
  clearTimeout(facultyDayTimer);const now=new Date(),next=new Date(now);next.setHours(24,0,0,100);
  facultyDayTimer=setTimeout(()=>{if(!$('facultyPage').hidden)
renderFacultyPage();scheduleFacultyDay();},next-now);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('facultyPage').hidden)renderFacultyPage();});
const topicAnimations=new WeakMap();
function measureFacultyTopics(){
  document.querySelectorAll('.faculty-topics').forEach(panel=>{
    const button=panel.nextElementSibling,items=[...panel.children],first=items[0]?.offsetTop||0;
    const overflow=items.some(item=>item.offsetTop>first+2),expanded=facultyExpanded.has(button.dataset.examExpand);
    button.hidden=!overflow;button.setAttribute('aria-expanded',String(expanded));
    button.textContent=expanded?`Recolher · ${items.length} assuntos`:`${items.length} assuntos`;
    panel.style.height='28px';
    if(expanded)panel.style.height=panel.scrollHeight+'px';
    items.forEach(item=>{const hidden=!expanded&&item.offsetTop>first+2;item.tabIndex=hidden?-1:0;item.inert=hidden;item.setAttribute('aria-hidden',String(hidden));});
  });
}
function toggleFacultyTopics(button){
  const panel=button.previousElementSibling,start=panel.getBoundingClientRect().height,id=button.dataset.examExpand;
  topicAnimations.get(panel)?.cancel();
  facultyExpanded.has(id)?facultyExpanded.delete(id):facultyExpanded.add(id);
  measureFacultyTopics();const end=parseFloat(panel.style.height);
  const animation=motion(panel,[{height:start+'px'},{height:end+'px'}],{duration:260,easing:'cubic-bezier(.22,1,.36,1)'});
  if(animation)topicAnimations.set(panel,animation);
}
let topicHighlightTimer,topicHighlight,topicHighlightLayer;
function revealFacultyTopic(code){
  clearTimeout(topicHighlightTimer);topicHighlight?.cancel();topicHighlightLayer?.remove();
  $('search').value='';$('subject').value='';$('exam').value='all';
  $('ankingOnly').checked=false;$('groupSpecialty').checked=false;
  showLibraryPage();if(typeof syncFilterControls==='function')syncFilterControls();
  const row=[...document.querySelectorAll('[data-row]')].find(el=>el.dataset.row===code);if(!row)return;
  row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView?.({behavior:reduceMotion()?'auto':'smooth',block:'center'});
  topicHighlightTimer=setTimeout(()=>{if($('libraryPage').hidden||!row.isConnected)return;
    const layer=document.createElement('span');layer.className='topic-arrival-highlight';layer.setAttribute('aria-hidden','true');row.append(layer);topicHighlightLayer=layer;
    topicHighlight=motion(layer,[{opacity:0,offset:0},{opacity:1,offset:.3},{opacity:1,offset:.45},{opacity:0,offset:1}],{duration:1400,easing:'ease-in-out'});
    if(topicHighlight)topicHighlight.onfinish=()=>layer.remove();else layer.remove();
  },reduceMotion()?0:350);
}
$('facultyDemo').onclick=()=>{
  if(!canEditDemoStructure())return;
  if(!facultyRecords.some(e=>e.id==='demo-many-topics')){
    const titles=['ANEMIAS CARENCIAIS','HEMOSTASIA','LEUCEMIAS','LINFOMAS','CEFALEIAS','EPILEPSIA','DOENÇAS DESMIELINIZANTES','ACIDENTE VASCULAR CEREBRAL','DERMATITES'];
    titles.forEach((title,i)=>{const code='DEMO'+(i+1);if(!data.some(m=>m.code===code))data.push({code,title,subject:'Clínica Médica III',specialty:i<4?'Hematologia':i<8?'Neurologia':'Dermatologia',date:localQuestionDate(),q:0,c:0,w:0,studied:false,anki:false});});
    facultyRecords.push({id:'demo-many-topics',type:'PR2.1',subject:'Clínica Médica III',date:localQuestionDate(),materialCodes:data.filter(m=>m.subject==='Clínica Médica III').map(m=>m.code),q:null,c:null,w:null});
  }
  renderFacultyPage();
};
if(typeof ResizeObserver!=='undefined'){
  let previousWidth=-1;new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==previousWidth){previousWidth=width;measureFacultyTopics();}}).observe($('facultyList'));
}else window.addEventListener('resize',measureFacultyTopics);
document.fonts?.ready.then(measureFacultyTopics);
renderFacultyPage();scheduleFacultyDay();
