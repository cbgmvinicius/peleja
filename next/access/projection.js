/* Read-only projection of the current workspace schema. Never writes browser storage. */
(function(root){
'use strict';
function projectWorkspace(payload){
 const source=structuredClone(payload),issues=[];
 for(const key of ['materials','exams','simulations','courses','questionSessions'])if(!Array.isArray(source[key]))throw Error('Lista ausente ou inválida: '+key);
 const unique=(rows,label)=>{const seen=new Set();for(const r of rows){if(!r||typeof r.id!=='string'||!r.id||seen.has(r.id))throw Error('Identificador inválido ou duplicado: '+label);seen.add(r.id);}return seen;};
 const materialIds=unique(source.materials,'assuntos');unique(source.exams,'provas');unique(source.simulations,'simulados');unique(source.questionSessions,'questões');
 const totals=rows=>rows.reduce((a,r)=>{if(![r.questions,r.correct,r.wrong].every(Number.isInteger)||r.questions<0||r.correct<0||r.wrong<0||r.correct+r.wrong!==r.questions)throw Error('Totais inconsistentes: '+r.id);a.q+=r.questions;a.c+=r.correct;a.w+=r.wrong;return a;},{q:0,c:0,w:0});
 const subjects=source.materials.map(m=>{
  let entries=m.questionEntries;
  if(entries==null){entries=[];if(m.questions||m.correct||m.wrong){entries=[{id:'legacy-'+m.id,date:m.classDate||'',questions:m.questions||0,correct:m.correct||0,wrong:m.wrong||0}];issues.push({kind:'legacy-questions',id:m.id,message:'Histórico agregado antigo: revisar data antes de permitir edição.'});}}
  if(!Array.isArray(entries))throw Error('Histórico inválido: '+m.id);
  unique(entries,'rodadas de '+m.id);
  return {id:m.id,code:m.id,displayCode:m.code||'',fullTitle:m.title,title:m.title,subject:m.subject,date:m.classDate||'',specialty:m.specialty||'',studied:!!m.read,anki:!!m.sketchyTags,ankiQuery:m.sketchyTags||'',driveUrl:m.driveUrl||'',notebookUrl:m.notebookUrl||'',...totals(entries),questionRounds:entries.map(r=>({id:r.id,date:r.date,q:r.questions,c:r.correct,w:r.wrong})),examTypes:[...new Set(source.exams.filter(e=>(e.materialIds||[]).includes(m.id)).map(e=>e.type))]};
 });
 const exams=source.exams.map(e=>{const links=e.materialIds||[];if(!Array.isArray(links))throw Error('Vínculos inválidos: '+e.id);for(const id of links)if(!materialIds.has(id))issues.push({kind:'missing-material',id:e.id,materialId:id,message:'Vínculo preservado; assunto não encontrado neste payload.'});if(e.grade!=null)issues.push({kind:'grade-only-ui',id:e.id,message:'A tela nova precisa exibir e preservar a nota direta.'});return {id:e.id,type:e.type,subject:e.subject,date:e.date,materialCodes:[...links],q:e.total??null,c:e.correct??null,w:e.wrong??null,grade:e.grade??null,performed:e.performed,performedOverride:e.performedOverride};});
 if(source.simulations.length)issues.push({kind:'simulation-adapter',message:'Gabaritos, anuladas e estatísticas por área precisam de adaptador próprio; originais preservados.'});
 return {source,subjects,exams,questions:{...totals(source.questionSessions),questionRounds:source.questionSessions.map(r=>({...r,q:r.questions,c:r.correct,w:r.wrong}))},courseRecords:structuredClone(source.courses),simulationRecords:structuredClone(source.simulations),preferences:structuredClone(source.preferences||{}),issues,readyForProduction:false};
}
if(typeof module!=='undefined')module.exports={projectWorkspace};else root.PELEJA_WORKSPACE_PROJECTION={projectWorkspace};
})(globalThis);
