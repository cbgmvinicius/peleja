// Isolated form study: edits only the in-memory demonstration catalog.
const editorCurriculum={'Clínica Médica III':['Dermatologia','Hematologia','Neurologia'],'Clínica Cirúrgica III':['Oftalmologia','Ortopedia','Otorrinolaringologia'],'Pediatria':[],'IESC VII':[],'HMP VII':[]};
const examChoices=['PR1.1','PR1.2','PR2.1','PR2.2','2CH','PF'].map(type=>({type}));
const demoExams={'Clínica Médica III':examChoices,'Pediatria':examChoices};
let editingCode=null,editorOpener=null,editorInitial='',rowMenuCode=null;
const editorSnapshot=()=>JSON.stringify([...$('subjectForm').elements].filter(el=>el.name||el.id).map(el=>[el.id,el.type==='checkbox'?el.checked:el.value]));
function closeMenus(){ $('eventMenu').hidden=true;$('rowMenu').hidden=true;$('new').setAttribute('aria-expanded','false');document.querySelectorAll('[data-edit-menu]').forEach(el=>el.setAttribute('aria-expanded','false')); }
function positionMenu(menu,button){const a=app.getBoundingClientRect(),b=button.getBoundingClientRect();menu.style.top=`${b.bottom-a.top+8}px`;menu.style.right=`${Math.max(12,a.right-b.right)}px`;
 // near the bottom (or behind the phone's tab bar) it opens upward instead of getting cut
 const h=menu.getBoundingClientRect().height,bar=document.querySelector('.mobile-tabs');const floor=innerHeight-(bar&&bar.offsetParent?bar.getBoundingClientRect().height:0)-8;
 if(h&&b.bottom+8+h>floor&&b.top-8-h>=8)menu.style.top=`${b.top-a.top-8-h}px`;}
function fillSpecialties(value=''){
  const subject=$('editorSubject').value,values=[...new Set([...(editorCurriculum[subject]||[]),...data.filter(m=>m.subject===subject).map(m=>m.specialty),value].filter(Boolean))];
  $('editorSpecialty').replaceChildren(new Option(subject?'Sem especialidade':'Escolha a disciplina primeiro',''),...values.map(v=>new Option(v,v)));
  $('editorSpecialty').value=value;$('editorSpecialty').disabled=!subject;
}
function fillExams(selected=null){
  const subject=$('editorSubject').value,exams=demoExams[subject]||[];
  $('editorExams').replaceChildren();
  if(!exams.length){const note=document.createElement('span');note.className='editor-empty';note.textContent=subject?'Nenhuma prova cadastrada':'Selecione a disciplina';$('editorExams').append(note);return;}
  exams.forEach((exam,index)=>{const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.name='examTypes';input.value=exam.type;input.id=`editorExam${index}`;input.checked=selected===null?exam.type==='PR2.1':selected.includes(exam.type);text.textContent=exam.type;label.title=exam.type==='2CH'?'Segunda chamada':exam.type==='PF'?'Prova final':exam.type;label.append(input,text);$('editorExams').append(label);});
}
function openEditor(code=null,opener=null){
  if(!canEditDemoStructure())return;
  closeMenus();editingCode=code;editorOpener=opener||document.activeElement;
  const m=data.find(x=>x.code===code);$('subjectForm').reset();$('editorError').hidden=true;
  const subjects=[...new Set([...Object.keys(editorCurriculum),...data.map(x=>x.subject)])];
  $('editorSubject').replaceChildren(new Option('Selecione',''),...subjects.map(v=>new Option(v,v)));
  $('editorName').value=m?(m.fullTitle||m.code+' '+m.title).toLocaleUpperCase('pt-BR'):'';
  $('editorSubject').value=m?.subject||$('subject').value||'';fillSpecialties(m?.specialty||'');
  const now=new Date();$('editorDate').value=m?.date||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  fillExams(m?(m.examTypes||['PR2.1']):null);
  $('editorNotebook').value=m?.notebookUrl||'';$('editorNotebook').setCustomValidity('');
  $('editorDrive').value=m?.driveUrl||'';$('editorDrive').setCustomValidity('');
  $('editorTitle').textContent=m?'Editar assunto':'Novo assunto';$('editorSave').textContent=m?'Salvar alterações':'Criar assunto';
  editorInitial=editorSnapshot();$('subjectDialog').showModal();$('editorName').focus();
  motion($('subjectForm'),[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.25,.1,.25,1)'});
}
function closeEditor(force=false){
  if(!force&&editorSnapshot()!==editorInitial){confirmPeleja('Descartar alterações do assunto?',()=>closeEditor(true));return;}
  $('subjectDialog').close();editorOpener?.isConnected&&editorOpener.focus();
}
$('new').setAttribute('aria-haspopup','true');$('new').setAttribute('aria-expanded','false');
$('new').onclick=()=>{const open=$('eventMenu').hidden;closeMenus();if(open){$('eventMenu').hidden=false;positionMenu($('eventMenu'),$('new'));$('new').setAttribute('aria-expanded','true');$('eventMenu').querySelector('button').focus();}};
$('eventMenu').onclick=e=>{const b=e.target.closest('[data-create]');if(!b)return;closeMenus();if(b.dataset.create==='subject')openEditor(null,$('new'));else if(b.dataset.create==='questions')openQuestions();else if(b.dataset.create==='college')openFaculty();else if(b.dataset.create==='residency')openMock();else if(b.dataset.create==='import')globalThis.PELEJA_OPEN_IMPORT?.();else toast('Nesta etapa estamos refinando o formulário de assunto.');};
$('library').addEventListener('click',e=>{const b=e.target.closest('[data-edit-menu]');if(!b)return;const open=$('rowMenu').hidden||rowMenuCode!==b.dataset.editMenu;closeMenus();rowMenuCode=b.dataset.editMenu;editorOpener=b;if(open){$('rowMenu').hidden=false;positionMenu($('rowMenu'),b);b.setAttribute('aria-expanded','true');$('rowMenu').querySelector('button:not([hidden])')?.focus();}});
$('registerQuestions').onclick=()=>{const code=rowMenuCode;closeMenus();openQuestions(code);};
$('editSubject').onclick=()=>openEditor(rowMenuCode,editorOpener);
$('deleteSubject').onclick=()=>{
  if(!canEditDemoStructure())return;
  const code=rowMenuCode,subject=data.find(m=>m.code===code);if(!subject)return;
  closeMenus();editorOpener?.focus();
  confirmPeleja('Excluir assunto?',()=>{
    data=data.filter(m=>m.code!==code);
    if(typeof facultyRecords!=='undefined'){facultyRecords.forEach(exam=>{exam.materialCodes=exam.materialCodes.filter(value=>value!==code);});renderFacultyPage();}
    render();$('search').focus();toast('Assunto excluído','trash');
  },{description:`${subject.fullTitle||subject.code+' '+subject.title}. O assunto, suas rodadas e seus vínculos com provas serão removidos da prévia.`,accept:'Excluir',destructive:true});
};
document.addEventListener('click',e=>{if(!e.target.closest('#eventMenu,#rowMenu,#new,[data-edit-menu]'))closeMenus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('subjectDialog').open){const opener=$('eventMenu').hidden?editorOpener:$('new');closeMenus();opener?.isConnected&&opener.focus();}});
$('editorSubject').onchange=()=>{fillSpecialties();fillExams();};
$('editorNotebook').oninput=()=>{$('editorNotebook').setCustomValidity('');};
$('editorDrive').oninput=()=>{$('editorDrive').setCustomValidity('');};
$('editorName').oninput=()=>{$('editorName').setCustomValidity('');};
$('editorClose').onclick=$('editorCancel').onclick=()=>closeEditor();
$('subjectDialog').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('subjectForm').onsubmit=e=>{
  e.preventDefault();if(!canEditDemoStructure())return;const title=$('editorName').value.trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR');
  if(!title){$('editorName').setCustomValidity('Informe o título do assunto.');$('editorName').reportValidity();return;}
  const rawDrive=$('editorDrive').value.trim(),driveUrl=driveLink(rawDrive);
  $('editorDrive').setCustomValidity(rawDrive&&!driveUrl?'Use um link HTTPS do Google Drive ou Google Docs.':'');
  const rawNotebook=$('editorNotebook').value.trim(),notebookUrl=notebookLink(rawNotebook);
  $('editorNotebook').setCustomValidity(rawNotebook&&!notebookUrl?'Use um link HTTPS do NotebookLM.':'');
  if(!$('subjectForm').reportValidity())return;
  const old=data.find(m=>m.code===editingCode);
  const record={...(old||{code:'demo-'+crypto.randomUUID(),q:0,c:0,w:0,created:false,studied:false}),fullTitle:title,title,subject:$('editorSubject').value,specialty:$('editorSpecialty').value,date:$('editorDate').value,driveUrl,notebookUrl,examTypes:[...$('editorExams').querySelectorAll('input:checked')].map(x=>x.value)};
  if(old)data[data.indexOf(old)]=record;else data.push(record);
  closeEditor(true);if($('dashboardPage')&&!$('dashboardPage').hidden)showLibraryPage();else render();
  const row=[...document.querySelectorAll('[data-row]')].find(el=>el.dataset.row===record.code);
  if(row){const focusTarget=row.querySelector('[data-edit-menu]');focusTarget.focus();motion(row,[{backgroundColor:'var(--soft)'},{backgroundColor:'transparent'}],{duration:650});}
  else $('search').focus();
  toast(row?(old?'Alterações salvas na demonstração':'Assunto criado na demonstração'):'Assunto salvo; os filtros atuais ocultam este registro.',row?(old?'edit':'add'):'filter');
};

