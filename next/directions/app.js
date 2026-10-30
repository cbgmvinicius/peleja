function canEditDemoStructure(){return app.dataset.previewRole!=='participant';}
function applyDemoPermissions(){
  const hidden=!canEditDemoStructure();
  if(document.getElementById('facultyDemo'))$('facultyDemo').hidden=hidden||$('facultyPage').hidden;
  document.querySelectorAll('[data-edit-menu],[data-exam-menu],[data-mock-menu],#facultyCreate,#mockCreate,#editSubject,#deleteSubject,#facultyMenuEdit,#facultyMenuDelete,#mockEdit,#mockDelete,#mockKeyEdit,[data-create=subject],[data-create=college],[data-create=residency]').forEach(button=>button.hidden=hidden);
}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={study:'<path d="m3 9 9-5 9 5-9 5-9-5ZM7 12v5c3 3 7 3 10 0v-5M21 9v7"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',refresh:'<path d="M3 11a9 9 0 0 1 15.4-6.4L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.4 6.4L3 17M3 21v-4h4"/>',clear:'<path d="m7 7 10 10M7 17 17 7"/>',check:'<path d="m5 12 4 4 10-10"/>',pending:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',created:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h5M8 16h7"/>',target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".7"/>',more:'<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'};
Object.assign(icons,{
  edit:'<path d="m15 4 5 5-11 11H4v-5ZM13 6l5 5"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  add:'<path d="M12 5v14M5 12h14"/>',
  calendar:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M9 15h6M12 12v6"/>',
  calendarCheck:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16m4 6 3 3 5-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4M16 10v4M10 16v4"/>',
  filter:'<path d="M4 5h16l-6 7v6l-4 2v-8z"/>'
});
const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
function driveLink(value){
  try{
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.username||url.password||!['drive.google.com','docs.google.com','drive.usercontent.google.com'].includes(url.hostname))return '';
    const file=url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/),id=file?.[1]||url.searchParams.get('id');
    if(id&&/^[A-Za-z0-9_-]+$/.test(id)){
      url.hostname='drive.google.com';url.pathname=`/file/d/${id}/view`;url.searchParams.delete('id');
    }else if(url.hostname==='drive.usercontent.google.com')return '';
    else if(url.hostname==='docs.google.com')url.pathname=url.pathname.replace(/\/(export|download)(?:\/.*)?$/,'/edit');
    ['export','download','confirm','format'].forEach(key=>url.searchParams.delete(key));
    return url.href;
  }catch{return '';}
}
function notebookLink(value){
  try{const url=new URL(String(value||'').trim());if(url.protocol!=='https:'||url.username||url.password||!['notebooklm.google.com','notebook.google.com','gemininotebook.google.com'].includes(url.hostname))return '';return url.href;}catch{return '';}
}
function notebookIcon(){return '<img class="notebook-logo-light" src="notebooklm-light.svg" alt=""><img class="notebook-logo-dark" src="notebooklm-dark.svg" alt="">';}
function notebookIndicator(value){
  const href=notebookLink(value);return href?`<a class="indicator notebook-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="Abrir quiz no NotebookLM" aria-label="Abrir quiz no NotebookLM (nova aba)">${notebookIcon()}</a>`:'';
}
function driveIndicator(value){
  const href=driveLink(value);return href?`<a class="indicator drive-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="Apostila disponível · Abrir no Google Drive" aria-label="Abrir apostila no Google Drive (nova aba)"><img src="drive.svg" alt=""></a>`:'';
}
const seed=[{code:'H04',date:'2026-10-19',title:'Talassemias',subject:'Clínica Médica III',specialty:'Hematologia',q:20,c:16,w:4,studied:true,created:true,anki:true},{code:'H06',date:'2026-10-21',title:'Anemia aplástica',subject:'Clínica Médica III',specialty:'Hematologia',q:20,c:16,w:4,created:true},{code:'N07',date:'2026-10-20',title:'Neuropatias & ELA',subject:'Clínica Médica III',specialty:'Neurologia',q:0,c:0,w:0},{code:'P18',date:'2026-10-19',title:'Desenvolvimento infantil',subject:'Pediatria',specialty:'Pediatria',q:0,c:0,w:0,created:true},{code:'P19',date:'2026-10-22',title:'Autismo',subject:'Pediatria',specialty:'Pediatria',q:0,c:0,w:0,created:true}];
let data=structuredClone(seed),toastTimer;const $=id=>document.getElementById(id),app=document.querySelector('.app');
let toastAnimation=null,toastVersion=0;
function toast(text,icon='info'){
  if(!Object.hasOwn(icons,icon))icon='info';
  const el=$('toast'),version=++toastVersion;el.dataset.icon=icon;
  clearTimeout(toastTimer);toastAnimation?.cancel();el.replaceChildren();
  const symbol=document.createElement('span');symbol.className='toast-symbol';symbol.setAttribute('aria-hidden','true');symbol.innerHTML=svg(icon);
  const copy=document.createElement('span');copy.className='toast-copy';
  const parts=String(text).split(' · '),title=document.createElement('span');title.className='toast-title';title.textContent=parts.shift();copy.append(title);
  if(parts.length){const detail=document.createElement('span');detail.className='toast-detail';detail.textContent=parts.join(' · ');copy.append(detail);}
  el.append(symbol,copy);el.hidden=false;
  toastAnimation=motion(el,[{opacity:0,transform:'translate(-50%, 10px) scale(.97)'},{opacity:1,transform:'translate(-50%, 0) scale(1)'}],{duration:240,easing:'cubic-bezier(.22,.8,.25,1)'});
  toastTimer=setTimeout(()=>{
    if(version!==toastVersion)return;
    toastAnimation=motion(el,[{opacity:1,transform:'translate(-50%, 0)'},{opacity:0,transform:'translate(-50%, 6px)'}],{duration:180,easing:'ease-in',fill:'forwards'});
    const finish=()=>{if(version===toastVersion){el.hidden=true;toastAnimation?.cancel();toastAnimation=null;}};
    if(toastAnimation)toastAnimation.onfinish=finish;else finish();
  },3000);
}
function compareLibrarySubjects(a,b){return (a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||(a.fullTitle||a.code+' '+a.title).localeCompare(b.fullTitle||b.code+' '+b.title,'pt-BR',{numeric:true,sensitivity:'base'})||a.code.localeCompare(b.code);}
function renderContent(){const query=$('search').value.toLocaleLowerCase('pt-BR'),subject=$('subject').value,exam=$('exam').value;const scope=['next','pending'].includes(exam)?new Set(window.libraryExamCodes?.(exam,subject)||[]):null;const visible=data.filter(m=>(!subject||subject===m.subject)&&`${m.code} ${escapeHtml(m.title)} ${m.specialty}`.toLocaleLowerCase('pt-BR').includes(query)&&(!$('ankingOnly').checked||m.anki)&&(scope?scope.has(m.code):exam==='all'||(m.examTypes||['PR2.1']).includes(exam))).sort(compareLibrarySubjects);const grouped=$('groupSpecialty').checked;const groups=grouped?Map.groupBy(visible,m=>m.subject+' / '+m.specialty):new Map([['',visible]]);$('library').classList.toggle('chronological',!grouped);$('library').innerHTML=[...groups].map(([name,rows])=>`<section class="group">${grouped?`<div class="group-heading"><h2>${escapeHtml(rows[0].specialty||'Sem especialidade')}</h2><span>${escapeHtml(rows[0].subject)}</span></div>`:''}${rows.map(m=>`<article class="row${m.studied?' is-studied':''}" data-row="${m.code}"><div class="info"><div class="title"><h3>${escapeHtml((m.fullTitle||m.code+' '+m.title).toLocaleUpperCase('pt-BR'))}</h3>${m.studied?`<span class="studied-indicator" role="img" aria-label="Estudado" title="Estudado">${svg('check')}</span>`:''}</div><p class="meta"><span>${!grouped?escapeHtml(m.subject)+' · ':''}${new Date(m.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}${m.examTypes?.length===0?'':' · '+escapeHtml((m.examTypes||['PR2.1']).join(', '))}</span></p><div class="indicators">${driveIndicator(m.driveUrl)}${notebookIndicator(m.notebookUrl)}${m.anki?'<button class="indicator" data-hint="AnKing: copiar NIDs. Nesta proposta, os dados são de demonstração." title="Copiar AnKing NIDs" aria-label="Copiar AnKing NIDs"><img src="../assets/anking.png" alt=""></button>':''}</div></div><div class="stats"><span>Questões<b>${m.q}</b></span><span class="correct">Acertos<b>${m.c}</b></span><span class="wrong">Erros<b>${m.w}</b></span></div><div class="actions"><button class="icon study-action" data-study="${m.code}" aria-label="${m.studied?'Desmarcar estudo':'Marcar como estudado'}: ${escapeHtml(m.title)}" aria-pressed="${!!m.studied}" title="${m.studied?'Estudado':'Estudo pendente'}">${svg('study')}</button><button class="icon" data-questions="${m.code}" title="Registrar questões" aria-label="Registrar questões de ${escapeHtml(m.title)}">${svg('target')}</button><button class="icon" data-edit-menu="${m.code}" aria-haspopup="true" aria-expanded="false" title="Mais ações" aria-label="Mais ações de ${escapeHtml(m.title)}">${svg('more')}</button></div></article>`).join('')}</section>`).join('');$('count').textContent=`${visible.length} assuntos`;$('studied').textContent=`${visible.filter(m=>m.studied).length} estudados`;$('library').hidden=!visible.length;$('empty').hidden=!!visible.length;applyDemoPermissions()}
const reduceMotion=()=>app.dataset.switchMotion==='off';
function motion(element,frames,options={}){
  if(!element?.animate||reduceMotion())return null;
  return element.animate(frames,{duration:180,easing:'cubic-bezier(.2,.7,.2,1)',...options});
}
function render(){
 const before=captureListMotion($('library'),'[data-row]','data-row');
 renderContent();
 playListMotion($('library'),'[data-row]','data-row',before);
 if(!$('empty').hidden)motion($('empty'),[{opacity:0},{opacity:1}]);
}
// Filter switches preserve each subject's visual position while the layout changes.
let libraryFilterEffects=[];
function renderLibrarySwitch(){
 const library=$('library'),bounds=library.getBoundingClientRect();
 const previous=new Map([...library.querySelectorAll(':scope > .group > [data-row]')].map(row=>[row.dataset.row,{node:row.cloneNode(true),rect:row.getBoundingClientRect()}]));
 libraryFilterEffects.forEach(effect=>effect());libraryFilterEffects=[];
 if(reduceMotion()||!library.animate){render();return;}
 renderContent();
 const duration=380,easing='cubic-bezier(.22,.8,.25,1)';
 const track=(node,frames,finish)=>{const animation=motion(node,frames,{duration,easing});const clean=()=>{animation?.cancel();finish?.();};libraryFilterEffects.push(clean);if(animation)animation.onfinish=clean;else clean();};
 const remaining=new Set();
 library.querySelectorAll(':scope > .group > [data-row]').forEach(row=>{
  remaining.add(row.dataset.row);const old=previous.get(row.dataset.row),now=row.getBoundingClientRect();
  if(old){const x=old.rect.left-now.left,y=old.rect.top-now.top;if(x||y)track(row,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}]);}
  else track(row,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}]);
 });
 const layer=document.createElement('div');layer.className='library-filter-exits';layer.setAttribute('aria-hidden','true');layer.inert=true;
 layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2';library.style.position='relative';library.append(layer);const origin=library.getBoundingClientRect();
 for(const [key,{node,rect}] of previous)if(!remaining.has(key)){
  node.style.cssText=`position:absolute;left:${rect.left-origin.left-library.clientLeft}px;top:${rect.top-origin.top-library.clientTop}px;width:${rect.width}px;height:${rect.height}px;margin:0`;
  layer.append(node);
 }
 // Inherit theme variables for the temporary outgoing subjects.
 const theme=getComputedStyle(app);['--ink','--muted','--accent','--negative','--soft','--surface','--line'].forEach(key=>layer.style.setProperty(key,theme.getPropertyValue(key)));
 layer.style.color=theme.color;
 track(layer,[{opacity:1},{opacity:0}],()=>layer.remove());
 library.querySelectorAll('.group-heading').forEach(heading=>track(heading,[{opacity:0},{opacity:1}]));
 const finalHeight=library.getBoundingClientRect().height;
 if(!library.hidden&&Math.abs(bounds.height-finalHeight)>1){library.style.overflow='clip';track(library,[{height:bounds.height+'px'},{height:finalHeight+'px'}],()=>library.style.overflow='');}
 if(!$('empty').hidden)track($('empty'),[{opacity:0},{opacity:1}]);
}
const studyEffects=new WeakMap();
function clearStudyEffects(button){
  const effects=studyEffects.get(button)||[];
  effects.forEach(({animation,element})=>{animation?.cancel();element?.remove();});
  studyEffects.delete(button);
  button.querySelector('svg')?.getAnimations?.().forEach(a=>a.cancel());
}
function celebrateStudy(button,indicator){
  if(reduceMotion()||!button.animate)return;
  const effects=[];studyEffects.set(button,effects);
  const add=(element,frames,options)=>{
    const animation=motion(element,frames,options);effects.push({animation,element});
    if(animation)animation.onfinish=()=>element.remove();else element.remove();
  };
  const ring=document.createElement('span');ring.className='study-ring';ring.setAttribute('aria-hidden','true');button.append(ring);
  add(ring,[{opacity:.65,transform:'scale(.75)'},{opacity:0,transform:'scale(1.7)'}],{duration:480,easing:'cubic-bezier(.16,1,.3,1)'});
  for(let i=0;i<6;i++){
    const dot=document.createElement('span');dot.className='study-spark';dot.setAttribute('aria-hidden','true');button.append(dot);
    const angle=(i*60-90)*Math.PI/180,x=Math.cos(angle)*29,y=Math.sin(angle)*29;
    add(dot,[{opacity:0,transform:'translate(-50%,-50%) scale(.3)',offset:0},{opacity:1,offset:.15},{opacity:0,transform:`translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(.3)`,offset:1}],{duration:460,easing:'cubic-bezier(.15,.7,.3,1)'});
  }
  motion(button.querySelector('svg'),[{transform:'scale(.8) rotate(-8deg)'},{transform:'scale(1.18) rotate(3deg)',offset:.45},{transform:'scale(1) rotate(0)'}],{duration:380,easing:'cubic-bezier(.2,.8,.3,1)'});
  const path=indicator.querySelector('path');path.setAttribute('pathLength','1');
  motion(path,[{strokeDasharray:'1',strokeDashoffset:1},{strokeDasharray:'1',strokeDashoffset:0}],{duration:280,easing:'ease-out'});
}
function restoreDemo(){
  const button=$('refresh');if(button.getAttribute('aria-busy')==='true')return;
  button.setAttribute('aria-busy','true');button.setAttribute('aria-disabled','true');
  const animation=motion(button.querySelector('svg'),[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:620,easing:'cubic-bezier(.35,0,.25,1)'});
  const finish=()=>{button.removeAttribute('aria-busy');button.removeAttribute('aria-disabled');};
  try{data=structuredClone(seed);if(typeof resetStandaloneQuestions==='function')resetStandaloneQuestions();if(typeof resetFaculty==='function')resetFaculty();if(typeof resetMocks==='function')resetMocks();if(typeof resetExtraCourses==='function')resetExtraCourses();render();if(typeof seedDashboardExams==='function'){seedDashboardExams();renderFacultyPage();}if(typeof renderDashboard==='function')renderDashboard();toast('Demonstração restaurada','refresh');}
  finally{if(animation){animation.onfinish=finish;animation.oncancel=finish;}else finish();}
}
function toggleStudy(button){
  const m=data.find(x=>x.code===button.dataset.study),row=button.closest('.row'),title=row.querySelector('.title');
  clearStudyEffects(button);
  m.studied=!m.studied;
  row.classList.toggle('is-studied',m.studied);
  button.setAttribute('aria-pressed',String(m.studied));
  button.setAttribute('aria-label',`${m.studied?'Desmarcar estudo':'Marcar como estudado'}: ${escapeHtml(m.title)}`);
  button.title=m.studied?'Estudado':'Estudo pendente';
  let indicator=title.querySelector('.studied-indicator');
  indicator?.getAnimations?.().forEach(a=>a.cancel());
  if(m.studied){
    if(!indicator){indicator=document.createElement('span');indicator.className='studied-indicator';indicator.setAttribute('role','img');indicator.setAttribute('aria-label','Estudado');indicator.title='Estudado';indicator.innerHTML=svg('check');title.append(indicator);}
    motion(indicator,[{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'scale(1)'}],{duration:200});
  }else if(indicator){
    indicator.setAttribute('aria-hidden','true');
    const animation=motion(indicator,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.8)'}],{duration:120});
    if(animation)animation.onfinish=()=>{if(!m.studied)indicator.remove();};else indicator.remove();
  }
  if(m.studied)indicator.removeAttribute('aria-hidden');
  if(m.studied)celebrateStudy(button,indicator);
  else motion(button.querySelector('svg'),[{transform:'scale(.9)'},{transform:'scale(1)'}],{duration:140});
  const visibleCodes=[...document.querySelectorAll('[data-row]')].map(el=>el.dataset.row);
  $('studied').textContent=`${data.filter(x=>visibleCodes.includes(x.code)&&x.studied).length} estudados`;
  toast(m.studied?'Estudado':'Estudo pendente',m.studied?'check':'pending');
}
function resetFilters(){$('search').value='';$('subject').value='';$('exam').value='all';$('ankingOnly').checked=false;$('groupSpecialty').checked=false;render()}
$('refresh').innerHTML=svg('refresh');$('searchIcon').innerHTML=svg('search');$('clear').innerHTML=svg('clear');
document.querySelectorAll('[data-direction]').forEach(b=>{if(b.tagName!=='BUTTON')return;b.onclick=()=>{app.dataset.direction=b.dataset.direction;document.querySelectorAll('button[data-direction]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('directionNote').textContent=b.dataset.direction==='a'?'A · Uma superfície contínua, divisões discretas e leitura rápida.':'B · Blocos por especialidade, com mais separação e presença visual.'}});
$('switchMotion').onclick=()=>{const enabled=app.dataset.switchMotion!=='on';app.dataset.switchMotion=enabled?'on':'off';$('switchMotion').setAttribute('aria-pressed',String(enabled));};
$('theme').onclick=()=>{const dark=app.classList.toggle('dark');document.body.classList.toggle('review-dark',dark);$('theme').setAttribute('aria-pressed',dark);$('theme').textContent=dark?'Claro':'Escuro'};
$('mobile').onclick=()=>{const small=$('viewport').classList.toggle('mobile');$('mobile').setAttribute('aria-pressed',small);$('mobile').textContent=small?'Computador':'Celular'};
['search','subject','exam','ankingOnly','groupSpecialty'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',['ankingOnly','groupSpecialty'].includes(id)?renderLibrarySwitch:render));$('clear').onclick=resetFilters;$('emptyClear').onclick=resetFilters;$('refresh').onclick=restoreDemo;
$('library').onclick=e=>{const study=e.target.closest('[data-study]');if(study){toggleStudy(study);return}const hint=e.target.closest('[data-hint]');if(hint)toast(hint.dataset.hint,'info')};
$('new').onclick=()=>toast('Assunto · Questões · Faculdade · Residência. O formulário será refinado depois de escolhermos a direção.');$('profile').onclick=()=>toast('Configurações · Tutorial · Sair','settings');render();

// Shared FLIP transition: keep identifiable items visually anchored across list updates.
function captureListMotion(host,selector,key){
 if(!host||reduceMotion())return new Map();
 return new Map([...host.querySelectorAll(selector)].filter(el=>el.getBoundingClientRect().height>0).map(el=>[el.getAttribute(key),{rect:el.getBoundingClientRect(),values:[...el.querySelectorAll('[data-motion-value]')].map(n=>Number(n.textContent.replace('%','').replace(',','.'))),bars:[...el.querySelectorAll('[data-motion-bar]')].map(n=>getComputedStyle(n).width)}]));
}
function playListMotion(host,selector,key,before){
 if(!host||reduceMotion()||!before.size)return;
 host.querySelectorAll(selector).forEach(el=>{
  const rect=el.getBoundingClientRect();if(!rect.height||rect.bottom<0||rect.top>innerHeight+200)return;
  const old=before.get(el.getAttribute(key)),options={duration:380,easing:'cubic-bezier(.22,.8,.25,1)'};
  if(old){const x=old.rect.left-rect.left,y=old.rect.top-rect.top;if(x||y)motion(el,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],options);
   el.querySelectorAll('[data-motion-bar]').forEach((bar,i)=>{if(old.bars[i])motion(bar,[{width:old.bars[i]},{width:getComputedStyle(bar).width}],options);});
   const values=[...el.querySelectorAll('[data-motion-value]')].map((node,i)=>({node,from:old.values[i],to:Number(node.dataset.motionValue),percent:node.dataset.motionFormat==='percent'})).filter(v=>Number.isFinite(v.from));
   if(values.length){const start=performance.now();const tick=now=>{if(!el.isConnected)return;const t=Math.min(1,(now-start)/380),ease=1-Math.pow(1-t,3);values.forEach(v=>{v.node.textContent=(v.from+(v.to-v.from)*ease).toLocaleString('pt-BR',{maximumFractionDigits:v.percent?1:0})+(v.percent?'%':'');});if(t<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);}
  }else motion(el,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],options);
 });
}
