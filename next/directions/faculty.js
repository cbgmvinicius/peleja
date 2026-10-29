let facultyWindowAnimation=null,facultyClosing=false;
// Faculty form study; records live only in this isolated demonstration.
let facultyRecords=[],facultyId=null,facultyInitial='',facultyDisclosureAnimation=null,facultyDisclosureTarget=false,facultyResultOnly=false;
window.libraryExamCodes=(mode,subject)=>{
 const today=new Date(),local=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 let exams=facultyRecords.filter(e=>(!subject||e.subject===subject)&&e.q==null&&(!e.date||e.date>=local));
 if(mode==='next'){
  const first=exams.filter(e=>e.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
  exams=first?exams.filter(e=>e.date===first.date):[];
 }
 return [...new Set(exams.flatMap(e=>e.materialCodes||[]))];
};
function resetFaculty(){facultyRecords=[];if(typeof renderFacultyPage==='function')renderFacultyPage();}
const facultySnapshot=()=>JSON.stringify([...$('facultyForm').elements].map(el=>[el.id||el.value,el.type==='checkbox'?el.checked:el.value]));
function renderFacultySubjects(selected=[]){
  const subject=$('facultyDiscipline').value;
  const rows=data.filter(m=>m.subject===subject).sort((a,b)=>a.date.localeCompare(b.date));
  $('facultySubjects').replaceChildren();
  for(const m of rows){
    const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
    input.type='checkbox';input.name='facultyMaterial';input.value=m.code;input.checked=selected.includes(m.code);
    text.textContent=(m.fullTitle||m.code+' '+m.title).toLocaleUpperCase('pt-BR');label.append(input,text);$('facultySubjects').append(label);
  }
  if(!rows.length){const note=document.createElement('p');note.textContent=subject?'Nenhum assunto nesta disciplina.':'Escolha a disciplina primeiro.';$('facultySubjects').append(note);}
  updateFacultyCount();
}
function updateFacultyCount(){ $('facultyCount').textContent=$('facultySubjects').querySelectorAll('input:checked').length; }
function updateFacultyWrong(){
  const a=$('facultyTotal').value,b=$('facultyCorrect').value,q=Number(a),c=Number(b);
  $('facultyWrong').value=a!==''&&b!==''&&Number.isInteger(q)&&Number.isInteger(c)&&q>0&&c>=0&&c<=q?String(q-c):'—';
}
function renderFacultyHistory(){
  $('facultyHistorySection').hidden=!facultyRecords.length;
  $('facultyHistory').innerHTML=[...facultyRecords].sort((a,b)=>a.date.localeCompare(b.date)).map(exam=>`<div class="question-round"><div><strong>${escapeHtml(exam.type)} · ${escapeHtml(exam.subject)}</strong><p>${escapeHtml(new Date(exam.date+'T12:00:00').toLocaleDateString('pt-BR'))} · ${exam.materialCodes.length} assuntos</p></div><button type="button" class="editor-cancel" data-faculty-edit="${exam.id}">Editar</button></div>`).join('');
}
function resetFacultyDisclosure(){facultyDisclosureAnimation?.cancel();facultyDisclosureAnimation=null;const panel=$('facultyResult');panel.style.height='';panel.style.overflow='';panel.removeAttribute('data-expanded');}
function openFaculty(id=null,{resultOnly=false}={}){
  if(!canEditDemoStructure()&&(!resultOnly||!id))return;
  facultyWindowAnimation?.cancel();facultyClosing=false;$('facultyDialog').classList.remove('is-closing');
  facultyResultOnly=resultOnly;
  closeMenus();resetFacultyDisclosure();facultyId=id;const exam=facultyRecords.find(x=>x.id===id);$('facultyForm').reset();$('facultyError').hidden=true;
  const subjects=[...new Set([...Object.keys(editorCurriculum),...data.map(m=>m.subject)])];
  $('facultyDiscipline').replaceChildren(new Option('Selecione',''),...subjects.map(v=>new Option(v,v)));
  $('facultyDiscipline').value=exam?.subject||$('subject').value||'';$('facultyType').value=exam?.type||'';$('facultyDate').value=exam?.date||localQuestionDate();
  renderFacultySubjects(exam?.materialCodes||[]);
  $('facultyTotal').value=exam?.q??'';$('facultyCorrect').value=exam?.c??'';updateFacultyWrong();
  $('facultyResult').open=facultyResultOnly||exam?.q!=null;
  $('facultyStructure').hidden=facultyResultOnly;
  $('facultyStructure').querySelectorAll('input,select').forEach(el=>el.disabled=facultyResultOnly);
  $('facultyTotal').required=$('facultyCorrect').required=facultyResultOnly;
  $('facultyForm').classList.toggle('result-only',facultyResultOnly);
  $('facultyResultSubject').hidden=!facultyResultOnly;
  $('facultyResultSubject').textContent=exam?`${exam.type} · ${exam.subject}`:'';
  $('facultyForm').querySelector('[type=submit]').textContent=facultyResultOnly?'Concluído':'Salvar';
  $('facultyTitle').textContent=facultyResultOnly?'Meu resultado':exam?'Editar prova':'Nova prova';renderFacultyHistory();if(facultyResultOnly)$('facultyHistorySection').hidden=true;facultyInitial=facultySnapshot();
  if(!$('facultyDialog').open)$('facultyDialog').showModal();(facultyResultOnly?$('facultyTotal'):$('facultyDiscipline')).focus();
  facultyWindowAnimation=motion($('facultyDialog'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
}
function canDiscardFaculty(action){if(facultySnapshot()===facultyInitial)action();else confirmPeleja('Descartar alterações da prova?',action);}
function closeFaculty(force=false,onClosed=null){
  if(facultyClosing)return;
  if(!force&&facultySnapshot()!==facultyInitial){canDiscardFaculty(()=>closeFaculty(true,onClosed));return;}
  const dialog=$('facultyDialog'),computed=getComputedStyle(dialog),start={opacity:computed.opacity,transform:computed.transform};
  facultyClosing=true;facultyWindowAnimation?.cancel();resetFacultyDisclosure();
  if(typeof closeCalendar==='function')closeCalendar(true);
  dialog.classList.add('is-closing');
  const finish=()=>{dialog.close();facultyWindowAnimation?.cancel();facultyWindowAnimation=null;dialog.classList.remove('is-closing');facultyClosing=false;$('new').focus();onClosed?.();};
  facultyWindowAnimation=motion(dialog,[start,{opacity:0,transform:'translateY(6px) scale(.99)'}],{duration:200,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});
  if(facultyWindowAnimation)facultyWindowAnimation.onfinish=finish;else finish();
}
$('facultyClose').onclick=$('facultyCancel').onclick=()=>closeFaculty();
$('facultyDialog').addEventListener('cancel',event=>{event.preventDefault();closeFaculty();});
$('facultyDiscipline').onchange=()=>{renderFacultySubjects();$('facultyError').hidden=true;};
$('facultySubjects').onchange=updateFacultyCount;
$('facultyTotal').oninput=$('facultyCorrect').oninput=updateFacultyWrong;
$('facultyHistory').onclick=event=>{const b=event.target.closest('[data-faculty-edit]');if(b)canDiscardFaculty(()=>openFaculty(b.dataset.facultyEdit));};
$('facultyForm').noValidate=true;
$('facultyForm').onsubmit=event=>{
  event.preventDefault();if(!$('facultyDialog').open||facultyClosing||(!canEditDemoStructure()&&!facultyResultOnly))return;
  $('facultyError').hidden=true;
  const fail=(message,focus)=>{$('facultyError').textContent=message;$('facultyError').hidden=false;focus?.focus();};
  if(!$('facultyTotal').validity.valid||!$('facultyCorrect').validity.valid)$('facultyResult').open=true;
  if(!$('facultyForm').reportValidity())return;
  const subject=$('facultyDiscipline').value,materialCodes=[...$('facultySubjects').querySelectorAll('input:checked')].map(x=>x.value);
  if(!materialCodes.length)return fail('Selecione ao menos um assunto.',$('facultySubjects').querySelector('input'));
  const rawQ=$('facultyTotal').value,rawC=$('facultyCorrect').value;
  const hasCounts=rawQ!==''||rawC!=='',q=hasCounts?Number(rawQ):null,c=hasCounts?Number(rawC):null;
  if(hasCounts&&(rawQ===''||rawC===''||!Number.isInteger(q)||!Number.isInteger(c)||q<1||c<0||c>q)){$('facultyResult').open=true;return fail('Confira o total e os acertos.',$('facultyTotal'));}
  const previous=facultyRecords.find(x=>x.id===facultyId);
  const exam={...(facultyRecords.find(x=>x.id===facultyId)||{}),id:facultyId||crypto.randomUUID(),subject,type:$('facultyType').value,date:$('facultyDate').value,materialCodes,q,c,w:hasCounts?q-c:null};
  const index=facultyRecords.findIndex(x=>x.id===facultyId);if(index>=0)facultyRecords[index]=exam;else facultyRecords.push(exam);
  closeFaculty(true,()=>{if(typeof showFacultyPage==='function'){ showFacultyPage(); }if(hasCounts&&(facultyResultOnly||previous?.q!==q||previous?.c!==c)){celebrateFacultyResult(exam,previous?.q!=null);}else toast(index>=0?'Prova atualizada':'Prova cadastrada',index>=0?'edit':'calendar');});
};
$('facultyResult').querySelector('summary').onclick=event=>{
  event.preventDefault();const panel=$('facultyResult'),expand=facultyDisclosureAnimation?!facultyDisclosureTarget:!panel.open,start=panel.getBoundingClientRect().height;
  resetFacultyDisclosure();facultyDisclosureTarget=expand;panel.open=true;panel.dataset.expanded=String(expand);
  const end=expand?panel.getBoundingClientRect().height:panel.querySelector('summary').getBoundingClientRect().height+2;panel.style.overflow='hidden';
  const animation=motion(panel,[{height:start+'px'},{height:end+'px'}],{duration:220,easing:'cubic-bezier(.25,.1,.25,1)'});
  const finish=()=>{panel.open=expand;panel.style.height='';panel.style.overflow='';panel.removeAttribute('data-expanded');facultyDisclosureAnimation=null;};
  if(animation){facultyDisclosureAnimation=animation;animation.onfinish=finish;}else finish();
};
