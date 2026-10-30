(function(root){
'use strict';
const areaName=s=>s==='Medicina Preventiva / Saúde Coletiva'?'Medicina Preventiva':s;
function projectSimulations(source,userId){
 const names=new Map(source.profiles.map(p=>[p.id,p.display_name||'Usuário'])),photos=new Map((source.photos||[]).map(p=>[p.user_id,p.image_data]));
 const areas=stats=>Object.entries(stats||{}).map(([name,s])=>({name:areaName(name),q:s.answered,c:s.correct,w:s.wrong}));
 return source.catalogs.map(e=>{
  const questions=source.questions.filter(q=>q.simulation_key===e.key).sort((a,b)=>a.question_number-b.question_number),own=source.results.find(r=>r.simulation_key===e.key&&r.user_id===userId),answers=new Map(source.answers.filter(a=>a.simulation_key===e.key).map(a=>[a.question_number,a.answer]));
  const stale=(source.manual||[]).find(r=>r.simulation_key===e.key&&r.basis!==source.bases[e.key]);
  const ready=questions.length>0&&questions.every(q=>/^(A|B|C|D|E|X|ANULADA|ANULADO|ANUL)$/.test(q.official_answer||''));
  return {id:'s-'+Array.from(e.key,c=>c.codePointAt(0).toString(16)).join('-'),sourceKey:e.key,name:e.name,date:e.date,q:own?.total??questions.length,c:own?.correct??null,areas:areas(own?.area_stats),manualAreas:own?.mode==='quick',answers:own?.mode==='answers'?questions.map(q=>answers.get(q.question_number)||'-').join(''):null,answerKey:ready?questions.map(q=>/^(X|ANUL)/.test(q.official_answer)?'X':q.official_answer).join(''):'',questionAreas:questions.map(q=>areaName(q.accepted_area||'')),questionNumbers:questions.map(q=>q.question_number),basis:source.bases[e.key],staleQuick:stale?{correct:stale.correct,areas:areas(stale.area_stats)}:null,participants:source.results.filter(r=>r.simulation_key===e.key).map(r=>({userId:r.user_id,name:names.get(r.user_id)||'Usuário',photo:photos.get(r.user_id),q:r.total,c:r.correct,w:r.wrong,areas:areas(r.area_stats),me:r.user_id===userId}))};
 });
}
async function loadSimulationData(client,userId){
 const pages=async(table,columns,order,own=false)=>{const result=[];for(let offset=0;;offset+=500){let query=client.from(table).select(columns);for(const field of order)query=query.order(field);if(own)query=query.eq('user_id',userId);const response=await query.range(offset,offset+499);if(response.error)throw response.error;result.push(...response.data);if(response.data.length<500)return result;}};
 const [profiles,catalogs,questions,answers,results,bases,photos,university,materials,materialExams,manual]=await Promise.all([pages('profiles','id,display_name',['id']),pages('simulation_catalog','key,name,date',['key']),pages('simulation_questions','simulation_key,question_number,official_answer,accepted_area',['simulation_key','question_number']),pages('simulation_user_answers','simulation_key,question_number,answer',['simulation_key','question_number'],true),client.rpc('simulation_results_next'),client.rpc('simulation_bases'),pages('profile_photos','user_id,image_data',['user_id']).catch(()=>[]),pages('university_results','user_id,exam_key,exam_name,exam_date,area,total,correct,wrong',['user_id','exam_key']),pages('material_area_results','user_id,area,total,correct,wrong',['user_id','area']),client.rpc('material_exam_results'),pages('simulation_manual_results','user_id,simulation_key,total,correct,wrong,area_stats,basis',['user_id','simulation_key'],true)]);
 if(materialExams.error)throw materialExams.error;if(results.error)throw results.error;if(bases.error)throw bases.error;return {profiles,catalogs,questions,answers,results:results.data||[],bases:bases.data||{},photos,university,materials,materialExams:materialExams.data||{types:[],rows:[]},manual};
}
if(typeof module!=='undefined')module.exports={projectSimulations,loadSimulationData};else root.PELEJA_SIMULATIONS={projectSimulations,loadSimulationData};
})(globalThis);
