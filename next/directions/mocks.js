// Simulados: isolated demonstration records, never sent to production.
let mockExams=typeof realMockSeed!=='undefined'?structuredClone(realMockSeed):[],mockId=null,mockResultOnly=false,mockInitial='',mockWindowAnimation=null,mockClosing=false,mockMenuId=null,performanceId=mockExams[0]?.id||null;
Object.assign(icons,{chart:'<path d="M4 19h16M7 15v-4m5 4V5m5 10V8"/>'});
const mockMarkup=`<section id="mockPage" aria-label="Simulados" hidden><div class="collection-meta"><span id="mockCount"></span></div><div id="mockList"></div><div id="mockEmpty" class="faculty-empty"><p>Nenhum simulado cadastrado.</p><button type="button" id="mockCreate" class="primary">+ Novo simulado</button></div></section><section id="performancePage" aria-label="Ranking geral" hidden><div class="ranking-shell"><div class="ranking-header"><div><h2>Classificação</h2></div><div id="rankingPeriods" class="sliding-tabs" role="group" aria-label="Período do ranking"><span class="sliding-thumb" aria-hidden="true"></span><button type="button" data-period="all" aria-pressed="true">Geral</button><button type="button" data-period="3" aria-pressed="false">3 meses</button><button type="button" data-period="6" aria-pressed="false">6 meses</button><button type="button" data-period="12" aria-pressed="false">1 ano</button></div></div><div id="rankingAreas" class="ranking-areas" role="group" aria-label="Grande área"></div><div id="rankingContent"></div></div></section>`;
app.querySelector('main').insertAdjacentHTML('beforeend',mockMarkup);
app.insertAdjacentHTML('beforeend',`<dialog id="performanceDialog" aria-label="Desempenho no simulado"><div class="performance-toolbar"><button type="button" class="icon" id="performanceClose" aria-label="Fechar desempenho">✕</button></div><div id="performanceContent"></div></dialog><div id="mockMenu" class="event-menu" hidden><button type="button" id="mockEdit">Editar</button><button type="button" id="mockKeyEdit">Gabarito e áreas</button><button type="button" id="mockDelete" class="danger-text">Excluir simulado</button></div>
<dialog id="mockDialog" aria-labelledby="mockTitle"><form id="mockForm" novalidate>
<div class="editor-heading"><div><span class="editor-kicker">RESIDÊNCIA</span><h2 id="mockTitle">Novo simulado</h2></div><button type="button" class="icon" id="mockClose" aria-label="Fechar formulário">✕</button></div>
<div id="mockStructure"><label class="editor-field"><span>Nome</span><input id="mockName" required maxlength="120" placeholder="Ex.: ENARE 2026" autocomplete="off"></label><div class="editor-field"><span id="mockDateLabel">Data</span><input id="mockDate" type="date" aria-labelledby="mockDateLabel" required></div></div>
<p id="mockIdentity" class="questions-subject" hidden></p>
<div class="question-numbers"><label class="editor-field"><span>Questões</span><input id="mockTotal" type="number" min="1" max="100000" step="1" required inputmode="numeric" placeholder="100"></label><label class="editor-field"><span>Acertos <small id="mockOptional">opcional</small></span><input id="mockCorrect" type="number" min="0" step="1" inputmode="numeric" placeholder="—"></label><div class="questions-wrong"><span>Erros</span><output id="mockWrong" for="mockTotal mockCorrect">—</output></div></div>
<p id="mockError" role="alert" hidden></p><div class="editor-footer"><button type="button" class="editor-cancel" id="mockCancel">Cancelar</button><button type="submit" class="primary" id="mockSave">Criar</button></div></form></dialog>`);
function hideMockPages(){
  $('mockPage').hidden=$('performancePage').hidden=true;
  for(const id of ['navMocks','navPerformance']){$(id).classList.remove('selected');$(id).removeAttribute('aria-current');}
  closeMockMenu();
}
function showMockView(page,nav){if(typeof hideDashboard==='function')hideDashboard();
  if(typeof hideExtraCourses==='function')hideExtraCourses();
  closeMenus();closeFacultyMenu();hideMockPages();$('libraryPage').hidden=$('facultyPage').hidden=true;$('facultyDemo').hidden=true;
  for(const id of ['navLibrary','navFaculty']){$(id).classList.remove('selected');$(id).removeAttribute('aria-current');}
  $(page).hidden=false;$(nav).classList.add('selected');$(nav).setAttribute('aria-current','page');
}
function renderMocks(){
  const exams=orderedFaculty(mockExams.map(e=>({...e,subject:e.name})));
  $('mockCount').textContent=`${exams.length} ${exams.length===1?'simulado':'simulados'}`;$('mockEmpty').hidden=!!exams.length;
  $('mockList').innerHTML=exams.map(e=>`<article class="mock-card" data-mock="${e.id}"><div class="info"><h3>${escapeHtml(e.name)}</h3><p class="meta">${new Date(e.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}</p></div><div class="stats"><span>Questões<b>${e.q}</b></span><span class="correct">Acertos<b>${e.c??'—'}</b></span><span class="wrong">Erros<b>${e.c==null?'—':e.q-e.c}</b></span></div><div class="actions"><button type="button" class="icon" data-mock-result="${e.id}" title="${e.c==null?'Adicionar':'Editar'} meu resultado" aria-label="${e.c==null?'Adicionar':'Editar'} meu resultado">${svg('target')}</button><button type="button" class="icon" data-mock-performance="${e.id}" title="Desempenho do simulado" aria-label="Desempenho do simulado">${svg('chart')}</button><button type="button" class="icon" data-mock-menu="${e.id}" title="Mais ações" aria-label="Mais ações" aria-haspopup="true" aria-expanded="false">${svg('more')}</button></div></article>`).join('');
  applyDemoPermissions();
}
function showMocks(){showMockView('mockPage','navMocks');renderMocks();}
function mockParticipants(exam){
  return exam.participants?.length?exam.participants:(exam.c!=null?[{name:'Vinícius',q:exam.q,c:exam.c,w:exam.q-exam.c,me:true}]:[]);
}
function mockPersonAvatar(person){
  const photo=typeof mockAvatars!=='undefined'?mockAvatars[person.name]:null;
  return photo?`<img class="ranking-avatar" src="${photo}" alt="" width="36" height="36">`:`<span class="ranking-avatar avatar-initial" aria-hidden="true">${escapeHtml(person.name.trim().charAt(0))}</span>`;
}
function mockClassification(participants,general=false){
  const ranked=[...participants].filter(p=>p.q>0).sort((a,b)=>b.c/b.q-a.c/a.q||a.name.localeCompare(b.name,'pt-BR'));
  if(!ranked.length)return '<p class="performance-missing">Nenhum resultado neste período.</p>';
  if(general)return `<div class="ranking-table-wrap"><table class="ranking-table"><thead><tr><th scope="col">#</th><th scope="col">Pessoa</th><th scope="col">Aproveitamento</th><th scope="col">Acertos</th><th scope="col">Questões</th><th scope="col">Simulados</th></tr></thead><tbody>${ranked.map(person=>{const rank=ranked.findIndex(p=>p.c*person.q===person.c*p.q)+1,pct=person.c/person.q*100;return `<tr data-ranking-person="${escapeHtml(person.name)}" class="${person.me?'is-me':''}"><td>${rank}º</td><th scope="row"><span class="ranking-person">${mockPersonAvatar(person)}<span>${escapeHtml(person.name)}${person.me?'<small>Você</small>':''}</span></span></th><td><div class="ranking-pct"><b data-motion-value="${pct}" data-motion-format="percent">${pct.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</b><span><i data-motion-bar style="width:${pct}%"></i></span></div></td><td><span class="ranking-mobile-label">Acertos</span><span data-motion-value="${person.c}">${person.c}</span></td><td><span class="ranking-mobile-label">Questões</span><span data-motion-value="${person.q}">${person.q}</span></td><td><span class="ranking-mobile-label">Simulados</span><span data-motion-value="${person.count}">${person.count}</span></td></tr>`;}).join('')}</tbody></table></div>`;
  return `<section class="mock-comparison" aria-label="Classificação do simulado"><h3>Neste simulado</h3><ol>${ranked.map(person=>{const rank=ranked.findIndex(p=>p.c*person.q===person.c*p.q)+1;return `<li class="${person.me?'is-me':''}"><span class="mock-place">${rank}º</span><strong class="ranking-person">${mockPersonAvatar(person)}<span>${escapeHtml(person.name)}${person.me?'<small>Você</small>':''}</span></strong><b>${(person.c/person.q*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%</b></li>`;}).join('')}</ol></section>`;
}
let mockRankingPeriod='all',mockRankingArea='all';
const rankingAreaNames=['Clínica Médica','Cirurgia','Pediatria','Ginecologia e Obstetrícia','Medicina Preventiva'];
$('rankingAreas').innerHTML=['Todas as áreas',...rankingAreaNames].map((name,index)=>`<button type="button" data-ranking-area="${index===0?'all':name}" aria-pressed="${index===0}"><span>${name}</span></button>`).join('');
$('rankingAreas').onclick=event=>{const button=event.target.closest('[data-ranking-area]');if(!button)return;mockRankingArea=button.dataset.rankingArea;for(const b of $('rankingAreas').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));renderGeneralRanking();};
function syncSlidingTabs(group,attribute,value){
  const buttons=[...group.querySelectorAll('button')],index=buttons.findIndex(b=>b.dataset[attribute]===value);group.style.setProperty('--tab-index',Math.max(0,index));group.style.setProperty('--tab-count',buttons.length);buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[attribute]===value)));
}
$('rankingPeriods').onclick=event=>{const button=event.target.closest('[data-period]');if(!button)return;mockRankingPeriod=button.dataset.period;syncSlidingTabs($('rankingPeriods'),'period',mockRankingPeriod);renderGeneralRanking();};
syncSlidingTabs($('rankingPeriods'),'period','all');
function mockPeriodStart(months,today=localQuestionDate()){
  if(months==='all')return '';
  const date=new Date(today+'T12:00:00'),start=new Date(date.getFullYear(),date.getMonth()-Number(months),1,12);
  start.setDate(Math.min(date.getDate(),new Date(start.getFullYear(),start.getMonth()+1,0).getDate()));
  return `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
}
function aggregateMockRanking(exams,months='all',today=localQuestionDate(),area='all'){
  const start=mockPeriodStart(months,today),people=new Map();let count=0;
  for(const exam of exams){
    if(!exam.date||exam.date>today||(start&&exam.date<start))continue;
    const participants=mockParticipants(exam).map(person=>{if(area==='all')return person;let areas=person.areas||(person.me?exam.areas:null);if(person.answers&&exam.answerKey&&typeof scoreMockAnswers==='function')areas=scoreMockAnswers(exam.answerKey,person.answers,exam.questionAreas).areas;const stats=areas?.find(a=>(a.name==='Medicina Preventiva / Saúde Coletiva'?'Medicina Preventiva':a.name)===area);return stats?{...person,q:stats.q,c:stats.c,w:stats.w}:null;}).filter(p=>p&&p.q>0&&p.c!=null&&p.c>=0&&p.c<=p.q);if(!participants.length)continue;count++;
    for(const p of participants){const key=p.userId||(p.me?'self':p.name),entry=people.get(key)||{userId:p.userId,photo:p.photo,name:p.name,q:0,c:0,w:0,count:0,me:!!p.me};entry.q+=p.q;entry.c+=p.c;entry.w+=p.q-p.c;entry.count++;people.set(key,entry);}
  }
  return {count,people:[...people.values()]};
}
function renderGeneralRanking(){
  const before=captureListMotion($('rankingContent'),'[data-ranking-person]','data-ranking-person');
  const result=aggregateMockRanking(mockExams,mockRankingPeriod,localQuestionDate(),mockRankingArea);$('rankingContent').innerHTML=mockClassification(result.people,true);
  playListMotion($('rankingContent'),'[data-ranking-person]','data-ranking-person',before);
}
function showGeneralRanking(){showMockView('performancePage','navPerformance');renderGeneralRanking();}
let performanceAnimation=null,performanceClosing=false,performanceOpener=null;
function showMockPerformance(id=performanceId){
  const e=mockExams.find(x=>x.id===id);if(!e)return;
  performanceId=id;closeMockMenu();performanceOpener=document.activeElement;performanceAnimation?.cancel();performanceClosing=false;
  const dialog=$('performanceDialog');dialog.classList.remove('is-closing');dialog.setAttribute('aria-label','Desempenho: '+e.name);
  const percent=e.c==null?null:Math.round(e.c/e.q*100),areas=(e.areas||[]).map(a=>({...a}));
  
  const breakdown=areas.length?`<section class="mock-areas area-chart"><div class="chart-heading"><h3>Por grande área</h3><div class="chart-legend"><span>Acertos</span><span>Erros</span></div></div>${areas.filter(a=>a.q>0).map(a=>`<div class="area-chart-row"><div class="area-chart-label"><span>${escapeHtml(a.name.replace('Medicina Preventiva / Saúde Coletiva','Medicina Preventiva'))}</span><b>${Math.round(a.c/a.q*100)}%</b></div><div class="area-chart-track" role="img" aria-label="${escapeHtml(a.name.replace('Medicina Preventiva / Saúde Coletiva','Medicina Preventiva'))}: ${a.c} acertos e ${a.w} erros em ${a.q} questões"><span class="area-chart-correct" style="width:${a.c/a.q*100}%"></span><span class="area-chart-wrong" style="width:${a.w/a.q*100}%"></span></div><div class="area-chart-counts"><span>${a.c} acertos</span><span>${a.w} erros</span></div></div>`).join('')}</section>`:'';
  $('performanceContent').innerHTML=`<div class="performance-personal"><h3>Meu desempenho</h3>${percent==null?'<p class="performance-missing">Resultado ainda não registrado.</p>':`<strong class="performance-score">${percent}%</strong><div class="performance-bar" role="img" aria-label="${percent}% de acertos"><span style="width:${percent}%"></span></div><div class="stats"><span>Questões<b>${e.q}</b></span><span class="correct">Acertos<b>${e.c}</b></span><span class="wrong">Erros<b>${e.q-e.c}</b></span></div>${breakdown}`}<button type="button" id="performanceResult" class="primary">${percent==null?'Adicionar resultado':'Editar resultado'}</button></div>${mockClassification(mockParticipants(e))}`;
  $('performanceResult').onclick=()=>closeMockPerformance(()=>openMock(e.id,true));
  if(!dialog.open)dialog.showModal();$('performanceClose').focus();performanceAnimation=motion(dialog,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
}
function closeMockPerformance(done=null){
  if(performanceClosing||!$('performanceDialog').open)return;
  const dialog=$('performanceDialog'),style=getComputedStyle(dialog),start={opacity:style.opacity,transform:style.transform};performanceClosing=true;performanceAnimation?.cancel();dialog.classList.add('is-closing');
  const finish=()=>{dialog.close();performanceAnimation?.cancel();performanceAnimation=null;performanceClosing=false;dialog.classList.remove('is-closing');performanceOpener?.isConnected&&performanceOpener.focus();if(typeof done==='function')done();};
  performanceAnimation=motion(dialog,[start,{opacity:0,transform:'translateY(6px) scale(.99)'}],{duration:200,easing:'ease-in-out',fill:'both'});if(performanceAnimation)performanceAnimation.onfinish=finish;else finish();
}
$('performanceClose').onclick=()=>closeMockPerformance();$('performanceDialog').addEventListener('cancel',event=>{event.preventDefault();closeMockPerformance();});
const mockSnapshot=()=>JSON.stringify([...['mockName','mockDate','mockTotal','mockCorrect'].map(id=>$(id).value),...(typeof mockModeSnapshot==='function'?mockModeSnapshot():[])]);
function updateMockWrong(){const q=Number($('mockTotal').value),c=Number($('mockCorrect').value);$('mockCorrect').max=q||100000;$('mockWrong').value=$('mockCorrect').value!==''&&q>0&&c>=0&&c<=q?String(q-c):'—';}
function openMock(id=null,resultOnly=false){
  if(typeof mockAdminView!=='undefined'&&!mockAdminView&&!resultOnly)return;
  closeMenus();closeMockMenu();mockWindowAnimation?.cancel();mockClosing=false;$('mockDialog').classList.remove('is-closing');mockId=id;mockResultOnly=resultOnly;const e=mockExams.find(x=>x.id===id);
  $('mockForm').reset();$('mockName').value=e?.name||'';$('mockDate').value=e?.date||localQuestionDate();$('mockTotal').value=e?.q??'';$('mockCorrect').value=e?.c??'';
  $('mockStructure').hidden=resultOnly;for(const id of ['mockName','mockDate'])$(id).disabled=resultOnly;
  $('mockCorrect').required=resultOnly;$('mockOptional').hidden=resultOnly;$('mockIdentity').hidden=!resultOnly;$('mockIdentity').textContent=e?.name||'';
  $('mockTitle').textContent=resultOnly?'Meu resultado':e?'Editar simulado':'Novo simulado';$('mockSave').textContent=resultOnly?'Concluído':e?'Salvar':'Criar';$('mockError').hidden=true;updateMockWrong();if(typeof prepareMockModes==='function')prepareMockModes(e,resultOnly);mockInitial=mockSnapshot();
  if(!$('mockDialog').open)$('mockDialog').showModal();$(resultOnly?'mockCorrect':'mockName').focus();mockWindowAnimation=motion($('mockDialog'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
}
function closeMock(force=false,done=null){
  if(mockClosing)return;
  if(!force&&mockSnapshot()!==mockInitial){confirmPeleja('Descartar alterações do simulado?',()=>closeMock(true,done));return;}
  mockClosing=true;if(typeof closeCalendar==='function')closeCalendar(true);const dialog=$('mockDialog'),style=getComputedStyle(dialog),start={opacity:style.opacity,transform:style.transform};mockWindowAnimation?.cancel();dialog.classList.add('is-closing');
  const finish=()=>{dialog.close();mockWindowAnimation?.cancel();mockWindowAnimation=null;mockClosing=false;dialog.classList.remove('is-closing');$('new').focus();done?.();};
  mockWindowAnimation=motion(dialog,[start,{opacity:0,transform:'translateY(6px) scale(.99)'}],{duration:200,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});if(mockWindowAnimation)mockWindowAnimation.onfinish=finish;else finish();
}
function celebrateMock(e,updated){
  clearQuestionCelebration();toast(`${updated?'Resultado atualizado':'Resultado salvo'} · ${Math.round(e.c/e.q*100)}% de acertos`,'target');const button=[...document.querySelectorAll('[data-mock-result]')].find(b=>b.dataset.mockResult===e.id);if(!button)return;
  button.focus();questionCelebrationButton=button;button.classList.add('question-completed');button.innerHTML=svg('check');celebrateStudy(button,button);celebrateQuestionTotals(button.closest('.mock-card').querySelector('.stats'),e,updated?'Resultado atualizado':`${e.q} questões · ${e.c} acertos`);questionCelebrationTimer=setTimeout(()=>clearQuestionCelebration(false),1650);
}
$('mockForm').onsubmit=event=>{
  event.preventDefault();if(mockClosing||!$('mockDialog').open||(typeof mockAdminView!=='undefined'&&!mockAdminView&&!mockResultOnly))return;$('mockError').hidden=true;
  if(!$('mockForm').checkValidity()&&typeof mockResultMode!=='undefined'&&mockResultMode==='quick')$('mockQuickAreas').open=true;if(!$('mockForm').reportValidity())return;const name=$('mockName').value.trim();if(!name){$('mockName').focus();return;}
  const detailed=typeof collectMockAnswers==='function'?collectMockAnswers():null;if(detailed?.error){if(typeof mockResultMode!=='undefined'&&mockResultMode==='quick')$('mockQuickAreas').open=true;$('mockError').textContent=detailed.error;$('mockError').hidden=false;return;}
  const q=detailed?.q??Number($('mockTotal').value),c=detailed?.c??($('mockCorrect').value===''?null:Number($('mockCorrect').value));
  if(!Number.isInteger(q)||q<1||(c!=null&&(!Number.isInteger(c)||c<0||c>q)))return;
  const previous=mockExams.find(x=>x.id===mockId),e={...(previous||{}),id:mockId||crypto.randomUUID(),name,date:$('mockDate').value,q,c};
  if(previous&&(previous.q!==q||previous.c!==c)){delete e.areas;delete e.answers;}
  if(detailed){Object.assign(e,{areas:detailed.areas,manualAreas:!!detailed.manualAreas});if(detailed.answers)e.answers=detailed.answers;else delete e.answers;}
  if(e.participants&&(detailed||previous.q!==q||previous.c!==c))e.participants=e.participants.filter(p=>!p.me).concat(c==null?[]:[{name:'Vinícius',q,c,w:q-c,me:true,...(detailed?{answers:detailed.answers,areas:detailed.areas}:{})}]);
  if(previous)mockExams[mockExams.indexOf(previous)]=e;else mockExams.push(e);
  closeMock(true,()=>{showMocks();if(c!=null&&(mockResultOnly||previous?.c!==c||previous?.q!==q))celebrateMock(e,previous?.c!=null);else toast(previous?'Simulado atualizado':'Simulado criado',previous?'edit':'calendar');});
};
function closeMockMenu(){$('mockMenu').hidden=true;document.querySelectorAll('[data-mock-menu]').forEach(b=>b.setAttribute('aria-expanded','false'));}
$('mockList').onclick=event=>{
  const result=event.target.closest('[data-mock-result]'),performance=event.target.closest('[data-mock-performance]'),menu=event.target.closest('[data-mock-menu]');
  if(result)openMock(result.dataset.mockResult,true);else if(performance)showMockPerformance(performance.dataset.mockPerformance);else if(menu){if(typeof syncMockAdmin==='function')syncMockAdmin();const open=$('mockMenu').hidden||mockMenuId!==menu.dataset.mockMenu;closeMockMenu();mockMenuId=menu.dataset.mockMenu;if(open){$('mockMenu').hidden=false;positionMenu($('mockMenu'),menu);menu.setAttribute('aria-expanded','true');$('mockEdit').focus();}}
};
$('mockEdit').onclick=()=>openMock(mockMenuId);
$('mockDelete').onclick=()=>{if(typeof mockAdminView!=='undefined'&&!mockAdminView)return;const e=mockExams.find(x=>x.id===mockMenuId);if(e)confirmPeleja('Excluir simulado?',()=>{mockExams=mockExams.filter(x=>x.id!==e.id);closeMockMenu();renderMocks();$('navMocks').focus();toast('Simulado excluído','trash');},{description:`${e.name}. Os resultados deste simulado serão removidos da prévia.`,accept:'Excluir',destructive:true});};
$('mockClose').onclick=$('mockCancel').onclick=()=>closeMock();$('mockDialog').addEventListener('cancel',event=>{event.preventDefault();closeMock();});
$('mockTotal').oninput=$('mockCorrect').oninput=updateMockWrong;
$('mockCreate').onclick=()=>openMock();$('navMocks').onclick=showMocks;$('navPerformance').onclick=showGeneralRanking;
document.addEventListener('click',event=>{if(!event.target.closest('#mockMenu,[data-mock-menu]'))closeMockMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('mockMenu').hidden){event.preventDefault();const button=[...document.querySelectorAll('[data-mock-menu]')].find(b=>b.dataset.mockMenu===mockMenuId);closeMockMenu();button?.focus();}});
function resetMocks(){mockExams=typeof realMockSeed!=='undefined'?structuredClone(realMockSeed):[];performanceId=mockExams[0]?.id||null;renderMocks();if(!$('performancePage').hidden)renderGeneralRanking();if($('performanceDialog').open)showMockPerformance();}
renderMocks();
