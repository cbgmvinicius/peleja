(function(root){
'use strict';
function prepareCatalogChange(remote,change,now=new Date().toISOString()){
 const payload=structuredClone(remote.payload||{}),catalog=structuredClone(remote.catalog);
 for(const key of ['materials','exams','simulations']){
  const old=new Map((payload[key]||[]).map(x=>[x.id,x]));
  payload[key]=catalog[key].map(item=>{
   const personal=old.get(item.id)||{},merged={...personal,...item};
   if(key==='materials')for(const k of ['read','made','notes','questions','correct','wrong','questionEntries']){delete merged[k];if(Object.hasOwn(personal,k))merged[k]=personal[k];}
   if(key==='exams')for(const k of ['total','correct','wrong','grade','performed','performedOverride']){delete merged[k];if(Object.hasOwn(personal,k))merged[k]=personal[k];}
   if(key==='simulations')merged.questions=(item.questions||[]).map(q=>({...q,...((personal.questions||[]).find(p=>p.number===q.number)?.userAnswer?{userAnswer:personal.questions.find(p=>p.number===q.number).userAnswer}:{})}));
   if(key==='materials'&&!Array.isArray(merged.questionEntries))merged.questionEntries=merged.questions?[{id:'legacy-'+item.id,date:merged.classDate||now.slice(0,10),questions:merged.questions,correct:merged.correct,wrong:merged.wrong}]:[];
   return merged;
  });
 }
 const key=change.kind.includes('mock')?'simulations':change.kind.includes('subject')?'materials':'exams',index=payload[key].findIndex(x=>x.id===change.id);
 if(change.kind.startsWith('delete-')){
  if(index<0)throw Error('Registro não encontrado');payload[key].splice(index,1);
  if(key==='materials')payload.exams.forEach(e=>e.materialIds=e.materialIds.filter(id=>id!==change.id));
 }else{
  const v=change.record;if(!change.id||(key!=='simulations'&&!v.subject?.trim()))throw Error('Escolha a disciplina.');
  if(key==='simulations'){
   if(!v.name?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!Array.isArray(v.questions)||v.questions.length<1||v.questions.length>1000)throw Error('Confira o nome, a data e as questões.');
   const old=index>=0?payload.simulations[index]:{id:change.id};
   const item={...old,name:v.name,date:v.date,questions:v.questions.map((q,i)=>{if(!['','A','B','C','D','E','ANULADA'].includes(q.correctAnswer))throw Error('Gabarito inválido');return {...((old.questions||[]).find(x=>x.number===i+1)||{}),id:q.id||change.id+'-q-'+(i+1),number:i+1,correctAnswer:q.correctAnswer,area:q.area||''};})};
   if(index>=0)payload.simulations[index]=item;else payload.simulations.push(item);
  }else if(key==='materials'){
   if(!v.title?.trim())throw Error('Informe o título.');
   const item={...(index>=0?payload.materials[index]:{id:change.id,read:false,questionEntries:[],questions:0,correct:0,wrong:0}),title:v.title,subject:v.subject,specialty:v.specialty||'',classDate:v.classDate,driveUrl:v.driveUrl||'',notebookUrl:v.notebookUrl||'',sketchyTags:v.sketchyTags||'',updatedAt:now};
   if(index>=0)payload.materials[index]=item;else payload.materials.push(item);
   const ids=new Set(change.examIds||[]);
   for(const id of ids)if(!payload.exams.some(e=>e.id===id&&e.subject===v.subject))throw Error('Prova incompatível com a disciplina.');
   payload.exams.forEach(e=>{e.materialIds=(e.materialIds||[]).filter(id=>id!==change.id);if(ids.has(e.id))e.materialIds.push(change.id);});
  }else{
   if(!v.type||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!Array.isArray(v.materialIds)||!v.materialIds.length)throw Error('Confira a prova, a data e os assuntos.');
   if(v.materialIds.some(id=>!payload.materials.some(m=>m.id===id&&m.subject===v.subject)))throw Error('Assunto incompatível com a disciplina.');
   const item={...(index>=0?payload.exams[index]:{id:change.id}),subject:v.subject,type:v.type,date:v.date,materialIds:[...new Set(v.materialIds)],updatedAt:now};
   if(index>=0)payload.exams[index]=item;else payload.exams.push(item);
  }
 }
 const nextCatalog={...catalog};
 for(const key of ['materials','exams','simulations'])nextCatalog[key]=payload[key].map(item=>{
  const v=structuredClone(item);for(const k of key==='materials'?['read','made','notes','questions','correct','wrong','questionEntries']:key==='exams'?['total','correct','wrong','grade','performed','performedOverride']:[])delete v[k];
  if(key==='simulations')v.questions.forEach(q=>delete q.userAnswer);return v;
 });
 return {payload,catalog:nextCatalog};
}
if(typeof module!=='undefined')module.exports={prepareCatalogChange};else root.PELEJA_CATALOG_WRITES={prepareCatalogChange};
})(globalThis);
