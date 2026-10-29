(function(root){
'use strict';
function preparePersonalChange(remote,change,now=new Date().toISOString()){
 const payload=structuredClone(remote.payload||{});
 for(const key of ['materials','exams','simulations','courses','questionSessions']){payload[key]??=[];if(!Array.isArray(payload[key]))throw Error('Histórico inválido');}
 payload.preferences??={};
 // The server validates all material histories, including untouched legacy rows.
 for(const m of payload.materials)if(m.questionEntries==null)m.questionEntries=(m.questions||m.correct||m.wrong)?[{id:'legacy-'+m.id,date:m.classDate||now.slice(0,10),questions:m.questions||0,correct:m.correct||0,wrong:m.wrong||0}]:[];
 if(change.kind==='preferences'){
  const prefs=change.preferences;if(typeof prefs?.dark!=='boolean'||typeof prefs?.motion!=='boolean')throw Error('Preferências inválidas');
  payload.preferences={...payload.preferences,pelejaNext:{dark:prefs.dark,motion:prefs.motion,navigation:'top'}};return payload;
 }
 if(change.kind==='course'){
  if(typeof change.id!=='string'||!change.id.trim()||typeof change.watched!=='boolean')throw Error('Aula inválida');
  const index=payload.courses.findIndex(r=>r.id===change.id);
  if(change.watched&&index<0)payload.courses.push({id:change.id,watchedAt:now});
  if(!change.watched)payload.courses=payload.courses.filter(r=>r.id!==change.id);
  return payload;
 }
 if(change.kind==='session'||change.kind==='delete-session'){
  const r=change.round,id=change.roundId||r?.id,index=payload.questionSessions.findIndex(x=>x.id===id);
  if(change.kind==='delete-session'){if(index<0)throw Error('Rodada não encontrada');payload.questionSessions.splice(index,1);}
  else{if(!r?.id||!r.subject?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||![r.q,r.c].every(Number.isInteger)||r.q<1||r.q>100000||r.c<0||r.c>r.q)throw Error('Confira a disciplina, a data e os acertos.');const entry={...(index>=0?payload.questionSessions[index]:{createdAt:now}),id:r.id,subject:r.subject,specialty:r.specialty||'',date:r.date,questions:r.q,correct:r.c,wrong:r.q-r.c,updatedAt:now};if(index>=0)payload.questionSessions[index]=entry;else payload.questionSessions.push(entry);}
  return payload;
 }
 const key=['exam','grade','delete-exam-result'].includes(change.kind)?'exams':'materials';
 const catalog=remote.catalog?.[key]||[];
 const base=catalog.find(x=>x.id===change.id);
 if(!base)throw Error('Este registro não pertence mais ao catálogo. Atualize os dados.');
 let record=payload[key].find(x=>x.id===change.id);
 if(!record){record=structuredClone(base);if(key==='materials')record.questionEntries=[];payload[key].push(record);}
 if(change.kind==='study'){
  if(typeof change.studied!=='boolean')throw Error('Estado de estudo inválido');record.read=change.studied;
 }else if(change.kind==='round'||change.kind==='delete-round'){
  if(record.questionEntries==null){
   record.questionEntries=[];
   if(record.questions||record.correct||record.wrong)record.questionEntries.push({id:'legacy-'+record.id,date:record.classDate||now.slice(0,10),questions:record.questions||0,correct:record.correct||0,wrong:record.wrong||0});
  }
  const id=change.roundId||change.round?.id,index=record.questionEntries.findIndex(r=>r.id===id);
  if(change.kind==='delete-round'){if(index<0)throw Error('Rodada não encontrada');record.questionEntries.splice(index,1);}
  else{
   const r=change.round;if(!r||!r.id||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||![r.q,r.c].every(Number.isInteger)||r.q<1||r.c<0||r.c>r.q)throw Error('Confira o total, os acertos e a data.');
   const entry={...(index>=0?record.questionEntries[index]:{}),id:r.id,date:r.date,questions:r.q,correct:r.c,wrong:r.q-r.c,updatedAt:now};entry.createdAt??=now;
   if(index>=0)record.questionEntries[index]=entry;else record.questionEntries.push(entry);
  }
  const totals=record.questionEntries.reduce((a,r)=>{if(![r.questions,r.correct,r.wrong].every(Number.isInteger)||r.correct+r.wrong!==r.questions||r.correct<0||r.wrong<0)throw Error('Histórico de questões inconsistente');return {questions:a.questions+r.questions,correct:a.correct+r.correct,wrong:a.wrong+r.wrong};},{questions:0,correct:0,wrong:0});Object.assign(record,totals);
 }else if(change.kind==='delete-exam-result'){
  Object.assign(record,{total:null,correct:null,wrong:null,grade:null,performed:false,performedOverride:null});
 }else if(change.kind==='grade'){
  if(typeof change.grade!=='number'||!Number.isFinite(change.grade)||change.grade<0||change.grade>10)throw Error('Informe uma nota de 0 a 10.');
  Object.assign(record,{total:null,correct:null,wrong:null,grade:change.grade,performed:true,performedOverride:true});
 }else if(change.kind==='exam'){
  if(![change.q,change.c].every(Number.isInteger)||change.q<1||change.c<0||change.c>change.q)throw Error('Confira o total e os acertos.');
  Object.assign(record,{total:change.q,correct:change.c,wrong:change.q-change.c,grade:null,performed:true,performedOverride:true});
 }else throw Error('Alteração não suportada');
 record.updatedAt=now;return payload;
}
function createPersonalWriter(client,getIdentity,getAdmin=()=>false){
 let snapshot=null,identity=null,busy=false,blocked=false,generation=0;
 return {
  load(remote,userId){snapshot=structuredClone(remote);identity=userId;blocked=false;generation++;},
  clear(){snapshot=null;identity=null;blocked=true;generation++;},
  previewCatalog(change){if(!getAdmin()||blocked||busy)throw Error('Atualize os dados antes de alterar.');const prepared=root.PELEJA_CATALOG_WRITES.prepareCatalogChange(snapshot,{...change,kind:change.kind.slice(8)});return {...snapshot,...prepared};},
  get snapshot(){return structuredClone(snapshot);},get busy(){return busy;},get blocked(){return blocked;},
  async remote(name,args){
   if(busy||blocked||!snapshot||identity!==getIdentity())throw Error('Atualize os dados antes de salvar.');
   const owner=identity,ticket=generation;busy=true;
   try{const result=await client.rpc(name,{...args,p_owner:owner});if(ticket!==generation||owner!==getIdentity())throw Error('A conta mudou durante o envio.');if(result.error)throw result.error;if(result.data?.saved!==true)throw Error('Confirmação incompleta');return result.data;}
   catch(error){if(ticket===generation)blocked=true;throw error;}finally{busy=false;}
  },
  async save(change){
   if(busy)throw Error('Aguarde o salvamento anterior.');
   if(blocked||!snapshot||!identity||identity!==getIdentity())throw Error('Atualize os dados da conta antes de salvar.');
   const publish=change.kind.startsWith('catalog-');
   if(publish&&!getAdmin())throw Error('Apenas o administrador pode alterar o catálogo.');
   const prepared=publish?root.PELEJA_CATALOG_WRITES.prepareCatalogChange(snapshot,{...change,kind:change.kind.slice(8)}):null;
   const draft=publish?prepared.payload:preparePersonalChange(snapshot,change),ticket=generation,owner=identity;
   busy=true;
   try{
    const result=await client.rpc('save_workspace',{p_owner:owner,p_payload:draft,p_revision:snapshot.revision,p_catalog_revision:snapshot.catalog_revision,p_publish_catalog:publish});
    if(ticket!==generation||owner!==getIdentity())throw Error('A conta mudou durante o salvamento.');
    if(result.error)throw result.error;
    if(!Number.isInteger(result.data?.revision)||!Number.isInteger(result.data?.catalog_revision))throw Error('Confirmação incompleta do servidor.');
    snapshot={...snapshot,...(publish?{catalog:prepared.catalog}:{}),payload:draft,revision:result.data.revision,catalog_revision:result.data.catalog_revision};return structuredClone(snapshot);
   }catch(error){if(ticket===generation)blocked=true;throw error;}
   finally{busy=false;}
  }
 };
}
if(typeof module!=='undefined')module.exports={preparePersonalChange,createPersonalWriter};else root.PELEJA_PERSONAL_WRITES={preparePersonalChange,createPersonalWriter};
})(globalThis);
