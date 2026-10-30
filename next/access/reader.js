(() => {
 'use strict';
 const host=document.createElement('section');host.id='reader';host.hidden=true;document.querySelector('main').append(host);
 let payload=null,tab='materials',subject='',search='',exam='all';
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
 const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const date=value=>value?new Date(value+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'}):'Sem data';
 const button=(text,fn,selected=false)=>{const b=node('button',text);b.type='button';b.onclick=fn;b.setAttribute('aria-pressed',String(selected));return b;};
 function menu(label,options,value,change){
  const details=node('details',null,'reader-select'),summary=node('summary',options.find(x=>x[0]===value)?.[1]||label);summary.setAttribute('aria-label',label);details.append(summary);const choices=node('div',null,'reader-options');
  options.forEach(([key,title])=>choices.append(button(title,()=>{details.open=false;change(key)},key===value)));details.append(choices);return details;
 }
 function stats(q,c,w){const dl=node('dl',null,'reader-stats');for(const [label,value] of [['Questões',q],['Acertos',c],['Erros',w]]){const cell=node('div');cell.append(node('dt',label),node('dd',value??'—'));dl.append(cell);}return dl;}
 function render(){
  if(!payload)return;
  host.replaceChildren();
  const nav=node('nav',null,'tabs');for(const [key,label] of [['materials','Biblioteca'],['exams','Provas']])nav.append(button(label,()=>{tab=key;render()},tab===key));host.append(nav);
  const list=node('div',null,'reader-list');
  if(tab==='materials'){
   const filters=node('div',null,'reader-filters'),input=node('input');input.type='search';input.placeholder='Buscar assunto';input.setAttribute('aria-label','Buscar assunto');input.value=search;
   input.oninput=()=>{search=input.value;renderRows(list)};
   filters.append(input,menu('Disciplina',[['','Todas as disciplinas'],...[...new Set(payload.materials.map(m=>m.subject))].filter(Boolean).sort().map(s=>[s,s])],subject,v=>{subject=v;render()}),menu('Prova',[['all','Todas as provas'],['next','Próxima prova'],['pending','Provas pendentes'],...[...new Set(payload.exams.map(e=>e.type))].filter(Boolean).sort().map(s=>[s,s])],exam,v=>{exam=v;render()}));host.append(filters);
  }
  host.append(list);renderRows(list);
 }
 function renderRows(list){
  list.replaceChildren();
  if(tab==='materials'){
   let exams=payload.exams.filter(e=>!subject||e.subject===subject);
   if(['next','pending'].includes(exam))exams=exams.filter(e=>!PELEJA_READ_WORKSPACE.examDone(e,day()));
   if(exam==='next'){const first=exams.filter(e=>e.date).sort((a,b)=>a.date.localeCompare(b.date))[0];exams=first?exams.filter(e=>e.date===first.date):[];}
   else if(!['all','pending'].includes(exam))exams=exams.filter(e=>e.type===exam);
   const ids=new Set(exams.flatMap(e=>e.materialIds||[]));
   const rows=payload.materials.filter(m=>(!subject||m.subject===subject)&&(exam==='all'||ids.has(m.id))&&`${m.title} ${m.subject} ${m.specialty||''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).sort((a,b)=>(a.classDate||'9999').localeCompare(b.classDate||'9999'));
   for(const m of rows){
    const article=node('article',null,'reader-row'+(m.read?' studied':''));article.dataset.id=m.id;
    const info=node('div',null,'reader-info');const title=node('h2',m.title);if(m.read){const check=node('span',' ✓','reader-check');check.setAttribute('aria-label','Estudado');title.append(check);}info.append(title,node('p',`${m.subject} · ${date(m.classDate)}`));
    const links=node('div',null,'reader-links');
    for(const [key,label,hosts] of [['driveUrl','Google Drive',['drive.google.com','docs.google.com']],['notebookUrl','NotebookLM',['notebook.google.com','notebooklm.google.com','gemininotebook.google.com']]]){
     try{const u=new URL(m[key]);if(u.protocol!=='https:'||!hosts.includes(u.hostname)||u.username||u.password)continue;const a=node('a',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}catch{}
    }
    if(m.sketchyTags)links.append(button('Copiar NIDs AnKing',async()=>{try{await navigator.clipboard.writeText(m.sketchyTags);document.getElementById('message').textContent='NIDs copiados.';}catch{document.getElementById('message').textContent='Não foi possível copiar os NIDs.';}}));info.append(links);
    const totals=Array.isArray(m.questionEntries)?m.questionEntries.reduce((a,r)=>[a[0]+r.questions,a[1]+r.correct,a[2]+r.wrong],[0,0,0]):[m.questions||0,m.correct||0,m.wrong||0];
    article.append(info,stats(...totals));list.append(article);
   }
  }else{
   const today=day();
   const ordered=[...payload.exams].sort((a,b)=>{const pa=!!a.date&&a.date<today,pb=!!b.date&&b.date<today;return Number(pa)-Number(pb)||(pa?(b.date||'').localeCompare(a.date||''):(a.date||'9999').localeCompare(b.date||'9999'));});
   for(const e of ordered){const article=node('article',null,'reader-row'),info=node('div',null,'reader-info');info.append(node('p',e.type),node('h2',e.subject),node('p',date(e.date)));
    const subjects=payload.materials.filter(m=>(e.materialIds||[]).includes(m.id));if(subjects.length){const details=node('details',null,'reader-subjects');details.append(node('summary',`${subjects.length} assuntos`));for(const m of subjects)details.append(button(m.title,()=>{tab='materials';subject='';exam='all';search=m.title;render();host.scrollIntoView({behavior:'smooth',block:'start'});}));info.append(details);}
    article.append(info);if(e.total!=null)article.append(stats(e.total,e.correct,e.wrong));else if(e.grade!=null)article.append(node('strong',`Nota ${Number(e.grade).toLocaleString('pt-BR')}`));else article.append(node('p','Sem resultado'));
    list.append(article);}
  }
  if(!list.children.length)list.append(node('p','Nenhum registro neste recorte.','reader-empty'));
 }
 window.PELEJA_READER={show(remote){payload=PELEJA_READ_WORKSPACE.combineWorkspace(remote);tab='materials';subject='';exam='all';search='';host.hidden=false;document.body.classList.add('connected');render();},clear(){payload=null;host.replaceChildren();host.hidden=true;document.body.classList.remove('connected');}};
})();
