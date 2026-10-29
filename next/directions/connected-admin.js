window.PELEJA_INSTALL_ADMIN=({writer,allowed,saveChange,hydrate})=>{
 const ready=()=>allowed()&&!writer.busy&&!writer.blocked;
 function commit(change,close,message){
  if(!ready())return;let draft;const before=writer.snapshot;
  try{draft=writer.previewCatalog(change);}catch(error){toast(error.message,'info');return;}
  close();hydrate(draft);toast(message,'edit');
  saveChange(change,()=>{},null,()=>hydrate(before));
 }
 // Select actual exam IDs, not labels: different periods can use the same PR code.
 fillExams=(selected=null)=>{
  const subject=$('editorSubject').value,m=data.find(x=>x.code===editingCode);
  const exams=facultyRecords.filter(e=>e.subject===subject).sort((a,b)=>a.date.localeCompare(b.date));
  const next=exams.find(e=>!isFacultyPerformed(e)&&e.date>=localQuestionDate());
  $('editorExams').replaceChildren();
  for(const e of exams){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.value=e.sourceId;input.checked=m?e.materialCodes.includes(m.code):e===next;text.textContent=e.type+' · '+(e.date||'Sem data');label.append(input,text);$('editorExams').append(label);}
  if(!exams.length)$('editorExams').textContent=subject?'Nenhuma prova cadastrada':'Selecione a disciplina';
 };
 $('subjectForm').onsubmit=event=>{
  event.preventDefault();if(!ready())return;
  const title=$('editorName').value.trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR'),rawDrive=$('editorDrive').value.trim(),rawNotebook=$('editorNotebook').value.trim();
  const driveUrl=driveLink(rawDrive),notebookUrl=notebookLink(rawNotebook);
  $('editorName').setCustomValidity(title?'':'Informe o título.');$('editorDrive').setCustomValidity(rawDrive&&!driveUrl?'Use um link HTTPS do Google Drive ou Google Docs.':'');$('editorNotebook').setCustomValidity(rawNotebook&&!notebookUrl?'Use um link HTTPS do NotebookLM.':'');
  if(!$('subjectForm').reportValidity())return;
  const old=data.find(m=>m.code===editingCode);
  commit({kind:'catalog-subject',id:old?.sourceId||crypto.randomUUID(),record:{title,subject:$('editorSubject').value,specialty:$('editorSpecialty').value,classDate:$('editorDate').value,driveUrl,notebookUrl,sketchyTags:$('editorQuery').value.trim()},examIds:[...$('editorExams').querySelectorAll('input:checked')].map(el=>el.value)},()=>closeEditor(true),old?'Assunto atualizado':'Assunto criado');
 };
 const content=$('facultyResult').querySelector('.faculty-result-content'),counts=content.querySelector('.question-numbers');
 const mode=document.createElement('div');mode.className='connected-result-mode';mode.innerHTML='<button type="button" data-result-mode="counts" aria-pressed="true">Questões</button><button type="button" data-result-mode="grade" aria-pressed="false">Nota direta</button>';
 const grade=document.createElement('label');grade.className='editor-field';grade.id='facultyGradeField';grade.hidden=true;grade.innerHTML='<span>Nota · 0 a 10</span><input id="facultyGrade" type="number" min="0" max="10" step="0.01" inputmode="decimal">';content.prepend(mode);content.append(grade);
 window.setConnectedResultMode=value=>{mode.dataset.mode=value;counts.hidden=value==='grade';grade.hidden=value!=='grade';$('facultyTotal').required=$('facultyCorrect').required=value==='counts'&&facultyResultOnly;$('facultyTotal').disabled=$('facultyCorrect').disabled=value==='grade';$('facultyGrade').disabled=value!=='grade';$('facultyGrade').required=value==='grade';mode.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.resultMode===value)));};
 mode.onclick=event=>{const button=event.target.closest('[data-result-mode]');if(button)setConnectedResultMode(button.dataset.resultMode);};
 const remove=document.createElement('button');remove.id='facultyDeleteResult';remove.type='button';remove.className='editor-cancel danger-text';remove.textContent='Excluir meu resultado';remove.hidden=true;$('facultyForm').querySelector('.editor-footer').prepend(remove);
 remove.onclick=()=>{if(writer.busy||writer.blocked)return;const exam=facultyRecords.find(e=>e.id===facultyId);if(!exam)return;confirmPeleja('Excluir meu resultado?',()=>{if(writer.busy||writer.blocked)return;const before=structuredClone(exam);Object.assign(exam,{q:null,c:null,w:null,grade:null,performed:false,performedOverride:null});closeFaculty(true);renderFacultyPage();toast('Resultado excluído','trash');saveChange({kind:'delete-exam-result',id:exam.sourceId},()=>{},null,()=>{Object.assign(exam,before);renderFacultyPage();});},{description:'Remove somente a tua nota e contagem de questões desta prova.',accept:'Excluir',destructive:true});};
 const baseOpen=openFaculty;openFaculty=(...args)=>{baseOpen(...args);const exam=facultyRecords.find(e=>e.id===facultyId);remove.hidden=!facultyResultOnly||!(exam?.q!=null||exam?.grade!=null);$('facultyGrade').value=exam?.grade??'';setConnectedResultMode(exam?.grade!=null?'grade':'counts');$('facultyResult').hidden=!facultyResultOnly;if(!facultyResultOnly){$('facultyTotal').required=$('facultyCorrect').required=$('facultyGrade').required=false;$('facultyGrade').disabled=true;}facultyInitial=facultySnapshot();};
 window.PELEJA_ADMIN_FACULTY=event=>{
  if(!ready()||!$('facultyDialog').open||!$('facultyForm').reportValidity())return;
  const old=facultyRecords.find(e=>e.id===facultyId);
  commit({kind:'catalog-exam',id:old?.sourceId||crypto.randomUUID(),record:{subject:$('facultyDiscipline').value,type:$('facultyType').value,date:$('facultyDate').value,materialIds:[...$('facultySubjects').querySelectorAll('input:checked')].map(el=>data.find(m=>m.code===el.value).sourceId)}},()=>closeFaculty(true),old?'Prova atualizada':'Prova criada');
 };
 $('deleteSubject').onclick=()=>{if(!ready())return;const m=data.find(m=>m.code===rowMenuCode);if(!m)return;closeMenus();confirmPeleja('Excluir assunto?',()=>commit({kind:'catalog-delete-subject',id:m.sourceId},()=>{},'Assunto excluído'),{description:'O assunto será retirado da Biblioteca e das provas para todos os participantes.',accept:'Excluir',destructive:true});};
 $('facultyMenuDelete').onclick=()=>{if(!ready())return;const e=facultyRecords.find(e=>e.id===facultyMenuId);if(!e)return;closeFacultyMenu();confirmPeleja('Excluir prova?',()=>commit({kind:'catalog-delete-exam',id:e.sourceId},()=>{},'Prova excluída'),{description:'A prova e seus resultados no ranking serão removidos para todos os participantes.',accept:'Excluir',destructive:true});};
};
