window.PELEJA_INSTALL_SIMULATIONS=({client,writer,getUser,allowed,saveChange,setSaving,refreshAccount})=>{
 let generation=0,loaded=false,loading=null,recovery=null,rankingSource=null,rankingKind='residency',rankingExam='all';
 const canManage=e=>allowed()&&e?.sourceKey?.startsWith('res::')&&writer.snapshot?.catalog?.simulations?.some(s=>s.id===e.sourceKey.slice(5));
 const originalRender=renderMocks;
 renderMocks=()=>{originalRender();document.querySelectorAll('[data-mock-menu]').forEach(b=>b.hidden=!canManage(mockExams.find(e=>e.id===b.dataset.mockMenu)));document.querySelectorAll('[data-mock-result]').forEach(b=>b.disabled=writer.busy||writer.blocked);};
 mockParticipants=e=>e.participants||[];
 mockPersonAvatar=p=>/^data:image\/(png|jpeg|webp);base64,/.test(p.photo||'')?`<img class="ranking-avatar" src="${escapeHtml(p.photo)}" alt="" width="36" height="36">`:`<span class="ranking-avatar avatar-initial" aria-hidden="true">${escapeHtml(p.name.trim().charAt(0))}</span>`;
 function reset(){generation++;loaded=false;rankingSource=null;recovery=null;recover.hidden=true;loading=null;mockExams=[];mockAdminView=false;performanceId=null;$('mockList').replaceChildren();$('rankingContent').replaceChildren();$('performanceContent').replaceChildren();}
 async function load(){
  if(loading)return loading;const ticket=generation,owner=getUser();if(!owner)return;
  loading=(async()=>{try{const source=await PELEJA_SIMULATIONS.loadSimulationData(client,owner);if(ticket!==generation||owner!==getUser())return;
   rankingSource=source;mockExams=PELEJA_SIMULATIONS.projectSimulations(source,owner);renderExamChoices();mockAdminView=allowed();loaded=true;renderMocks();renderGeneralRanking();return true;
  }catch(error){if(ticket===generation&&owner===getUser()){loaded=false;for(const id of ['mockList','rankingContent'])$(id).innerHTML='<p class="performance-missing">Não foi possível carregar. Use Atualizar para tentar novamente.</p>';toast('Não foi possível carregar os simulados','info');}return false;}finally{if(ticket===generation)loading=null;}})();return loading;
 }
  const kinds=document.createElement('div');kinds.className='sliding-tabs connected-ranking-kinds';kinds.setAttribute('aria-label','Categoria do ranking');kinds.innerHTML='<span class="sliding-thumb" aria-hidden="true"></span><button type="button" data-kind="residency">Residência</button><button type="button" data-kind="faculty">Faculdade</button><button type="button" data-kind="materials">Assuntos</button>';$('performancePage').querySelector('.ranking-shell').prepend(kinds);
 const exams=document.createElement('div');exams.id='connectedRankingExams';exams.className='ranking-areas';exams.hidden=true;$('rankingAreas').after(exams);
 function renderExamChoices(){exams.innerHTML=[['all','Todas as provas'],...(rankingSource?.materialExams?.types||[]).map(t=>[t,t])].map(([id,label])=>`<button type="button" data-ranking-exam="${escapeHtml(id)}" aria-pressed="${id===rankingExam}">${escapeHtml(label)}</button>`).join('');}
 kinds.onclick=event=>{const b=event.target.closest('[data-kind]');if(!b)return;rankingKind=b.dataset.kind;syncSlidingTabs(kinds,'kind',rankingKind);$('rankingPeriods').hidden=rankingKind==='materials';exams.hidden=rankingKind!=='materials';renderGeneralRanking();};
 exams.onclick=event=>{const b=event.target.closest('[data-ranking-exam]');if(!b)return;rankingExam=b.dataset.rankingExam;renderExamChoices();renderGeneralRanking();};syncSlidingTabs(kinds,'kind',rankingKind);
 const baseRanking=renderGeneralRanking;renderGeneralRanking=()=>{
  if(rankingKind==='residency'){baseRanking();return;}const source=rankingSource;if(!source){$('rankingContent').replaceChildren();return;}
  const people=new Map(),names=new Map(source.profiles.map(p=>[p.id,p.display_name])),photos=new Map(source.photos.map(p=>[p.user_id,p.image_data])),start=mockPeriodStart(mockRankingPeriod),today=localQuestionDate();
  const rows=rankingKind==='faculty'?source.university:rankingExam==='all'?source.materials:(source.materialExams.rows||[]).filter(r=>r.exam_type===rankingExam);
  for(const row of rows){if(mockRankingArea!=='all'&&cleanMockArea(row.area)!==mockRankingArea)continue;if(rankingKind==='faculty'&&(!row.exam_date||row.exam_date>today||(start&&row.exam_date<start)))continue;if(!(Number(row.total)>0))continue;const p=people.get(row.user_id)||{userId:row.user_id,name:names.get(row.user_id)||'Usuário',photo:photos.get(row.user_id),me:row.user_id===getUser(),q:0,c:0,w:0,units:new Set()};p.q+=Number(row.total);p.c+=Number(row.correct);p.w+=Number(row.wrong);p.units.add(row.exam_key||row.area);p.count=p.units.size;people.set(row.user_id,p);}
  const before=captureListMotion($('rankingContent'),'[data-ranking-person]','data-ranking-person');$('rankingContent').innerHTML=mockClassification([...people.values()],true).replaceAll('Simulados',rankingKind==='faculty'?'Provas':'Áreas');playListMotion($('rankingContent'),'[data-ranking-person]','data-ranking-person',before);
 };
 const localShowMocks=showMocks,localShowRanking=showGeneralRanking;
 showMocks=()=>{localShowMocks();if(!loaded){$('mockList').innerHTML='<p class="performance-missing">Carregando…</p>';load();}};
 showGeneralRanking=()=>{localShowRanking();if(!loaded){$('rankingContent').innerHTML='<p class="performance-missing">Carregando…</p>';load();}};
 $('navMocks').onclick=showMocks;$('navPerformance').onclick=showGeneralRanking;
 const baseOpen=openMock;openMock=(id=null,resultOnly=false)=>{if((!allowed()&&!resultOnly)||(!loaded&&resultOnly))return;baseOpen(id,resultOnly);const e=mockExams.find(x=>x.id===id);if(resultOnly&&e){$('mockTotal').value=e.questionNumbers.length;$('mockTotal').readOnly=true;updateMockWrong();if(e.staleQuick){$('mockCorrect').value=e.staleQuick.correct;$('mockError').textContent='O gabarito ou as áreas mudaram. Confira o resultado anterior e salve novamente.';$('mockError').hidden=false;}}remove.hidden=!resultOnly||e?.c==null;mockInitial=mockSnapshot();};
 const remove=document.createElement('button');remove.type='button';remove.className='editor-cancel danger-text';remove.textContent='Excluir meu resultado';remove.id='mockDeleteResult';remove.hidden=true;$('mockForm').querySelector('.editor-footer').prepend(remove);
 const recover=document.createElement('button');recover.type='button';recover.textContent='Recuperar resultado';recover.hidden=true;document.querySelector('.connection-notice').append(recover);
 recover.onclick=async()=>{if(!recovery||recovery.owner!==getUser())return;const draft=recovery;await refreshAccount();await load();if(getUser()!==draft.owner)return;const e=mockExams.find(e=>e.sourceKey===draft.key);if(!e)return;showMocks();openMock(e.id,true);setMockResultMode(draft.mode);$('mockAnswers').value=draft.answers;$('mockCorrect').value=draft.correct;draft.inputs.forEach((value,i)=>$('mockQuickAreas').querySelectorAll('input')[i].value=value);updateMockWrong();};
 async function send(e,args,optimistic,draft=null){
  if(writer.busy||writer.blocked)return;const owner=getUser(),ticket=generation,before=structuredClone(mockExams);let failed=false;
  optimistic();renderMocks();renderGeneralRanking();closeMock(true,()=>{if(!failed&&owner===getUser()&&ticket===generation){showMocks();if(args.p_mode==='delete')toast('Resultado excluído','trash');else celebrateMock(e,before.find(x=>x.id===e.id)?.c!=null);}});
  try{const request=writer.remote('save_simulation_attempt_next',args);setSaving(true);await request;if(owner!==getUser()||ticket!==generation)return;recovery=null;recover.hidden=true;loaded=false;await load();}
  catch(error){if(owner!==getUser()||ticket!==generation)return;failed=true;clearQuestionCelebration();mockExams=before;renderMocks();renderGeneralRanking();if(draft){recovery={...draft,owner,key:e.sourceKey};recover.hidden=false;}toast('Não foi possível confirmar o resultado. Atualize antes de tentar novamente.','info');}
  finally{if(owner===getUser()&&ticket===generation)setSaving(false);}
 }
 const rpcArgs=(e,mode)=>({p_key:e.sourceKey,p_mode:mode,p_answers:{},p_correct:null,p_areas:{},p_basis:e.basis});
 remove.onclick=()=>{const e=mockExams.find(x=>x.id===mockId);if(!e)return;confirmPeleja('Excluir meu resultado?',()=>send(e,rpcArgs(e,'delete'),()=>{e.c=null;e.areas=[];e.answers=null;e.participants=e.participants.filter(p=>!p.me);}),{description:'Somente o teu resultado deste simulado será removido.',accept:'Excluir',destructive:true});};
 const toBackendArea=name=>name==='Medicina Preventiva'?'Medicina Preventiva / Saúde Coletiva':name;
 function catalogChange(kind,e,record){
  if(!allowed()||(e&&!canManage(e))||writer.busy||writer.blocked)return;const before=structuredClone(mockExams),id=e?.sourceKey?.replace(/^res::/,'')||crypto.randomUUID(),change={kind:'catalog-'+kind,id,record};
  try{writer.previewCatalog(change);}catch(error){toast(error.message,'info');return;}
  closeMock(true);if($('mockKeyDialog').open)closeMockKey(true);
  if(kind==='delete-mock')mockExams=mockExams.filter(x=>x!==e);else if(!e){mockExams.push({id:'pending-'+id,sourceKey:'res::'+id,name:record.name,date:record.date,q:record.questions.length,c:null,areas:[],participants:[],questionNumbers:record.questions.map((_,i)=>i+1),questionAreas:[],answerKey:''});}else if(e){e.name=record.name;e.date=record.date;e.q=record.questions.length;e.answerKey=record.questions.every(q=>q.correctAnswer)?record.questions.map(q=>q.correctAnswer==='ANULADA'?'X':q.correctAnswer).join(''):'';e.questionAreas=record.questions.map(q=>cleanMockArea(q.area));}
  renderMocks();saveChange(change,()=>{loaded=false;load();toast(kind==='delete-mock'?'Simulado excluído':'Simulado salvo','edit');},null,()=>{mockExams=before;renderMocks();});
 }
 $('mockForm').onsubmit=event=>{
  event.preventDefault();if(writer.busy||writer.blocked||mockClosing||!$('mockForm').reportValidity())return;const e=mockExams.find(x=>x.id===mockId);
  if(!mockResultOnly){const q=Number($('mockTotal').value);if(!Number.isInteger(q)||q<1||q>1000){$('mockError').textContent='Use de 1 a 1000 questões.';$('mockError').hidden=false;return;}catalogChange('mock',e,{name:$('mockName').value.trim(),date:$('mockDate').value,questions:Array.from({length:q},(_,i)=>({correctAnswer:e?.answerKey?.[i]==='X'?'ANULADA':e?.answerKey?.[i]||'',area:toBackendArea(e?.questionAreas?.[i]||'')}))});return;}
  if(!e)return;const detail=collectMockAnswers();if(detail?.error){$('mockError').textContent=detail.error;$('mockError').hidden=false;return;}
  const q=e.questionNumbers.length,c=detail?.c??Number($('mockCorrect').value);if(!Number.isInteger(c)||c<0||c>q)return;
  const args=rpcArgs(e,mockResultMode),areas=detail?.areas||[];
  if(mockResultMode==='answers')e.questionNumbers.forEach((n,i)=>args.p_answers[n]=detail.answers[i]);else{args.p_correct=c;for(const area of areas)args.p_areas[toBackendArea(area.name)]={total:area.q,correct:area.c};}
  const draft={mode:mockResultMode,answers:$('mockAnswers').value,correct:$('mockCorrect').value,inputs:[...$('mockQuickAreas').querySelectorAll('input')].map(x=>x.value)};
  send(e,args,()=>{e.q=q;e.c=c;e.areas=areas;e.answers=detail?.answers||null;e.manualAreas=mockResultMode==='quick';const own=e.participants.find(p=>p.me);e.participants=e.participants.filter(p=>!p.me).concat([{userId:getUser(),name:own?.name||$('profile').getAttribute('aria-label').replace('Perfil de ',''),photo:own?.photo,q,c,w:q-c,me:true,areas}]);},draft);
 };
 $('mockDelete').onclick=()=>{const e=mockExams.find(x=>x.id===mockMenuId);if(!allowed()||!e)return;confirmPeleja('Excluir simulado?',()=>catalogChange('delete-mock',e),{description:'O simulado e seus resultados serão removidos para todos.',accept:'Excluir',destructive:true});};
 $('mockKeyForm').onsubmit=event=>{event.preventDefault();if(!allowed()||!applyKeySequence())return;const e=mockExams.find(x=>x.id===keyExamId);if(!e)return;catalogChange('mock',e,{name:e.name,date:e.date,questions:keyDraft.map(q=>({correctAnswer:q.answer==='X'?'ANULADA':q.answer,area:toBackendArea(q.area)}))});};
 reset();return {reset,load};
};
