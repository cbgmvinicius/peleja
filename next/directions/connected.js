(async () => {
 if(!globalThis.PELEJA_CONNECTED)return;
 document.title='Peleja · Sua conta';
 const gate=$('connectionGate'),status=gate.querySelector('p');
 let client=null,version=0,currentSession=null,loading=false,writer=null,isAdmin=false,simulations=null,courses=null,dashboard=null,profileName="Conta",pendingConflict=null;
 const writeSelector='[data-edit-menu],[data-exam-menu],#new,[data-create],#facultyCreate,#facultyDemo,#settingsImport,#settingsExport';
 // Block mutations before any demo event handler, including keyboard activation.
 document.addEventListener('click',event=>{if(event.target.closest(writeSelector)&&((!isAdmin&&!event.target.closest('#new,[data-create=questions]'))||event.target.closest('#facultyDemo,#settingsImport,#settingsExport'))){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('submit',event=>{if(loading){event.preventDefault();event.stopImmediatePropagation();return;}if(!['questionsForm','facultyForm','mockForm',...(isAdmin?['subjectForm','mockKeyForm']:[])].includes(event.target.id)){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('click',event=>{if((writer?.busy||loading)&&event.target.closest('[data-study],[data-round-edit],[data-round-delete],#questionsSave,#facultyForm [type=submit],#profileExit,#refresh,[data-extra-check],[data-create],[data-edit-menu],[data-exam-menu],[data-mock-menu],#settingsTheme,#settingsMotion')){event.preventDefault();event.stopImmediatePropagation();}},true);
 function lockContent(){
  simulations?.reset();courses?.reset();dashboard?.reset();isAdmin=false;app.dataset.previewRole='participant';writer?.clear();document.documentElement.classList.add('connected-loading');gate.hidden=false;gate.classList.remove('entry-error');
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  data=[];facultyRecords=[];resetStandaloneQuestions();$('library').replaceChildren();$('facultyList').replaceChildren();
 }
 function fail(text){lockContent();gate.classList.add('entry-error');status.textContent=text;gate.querySelector('a')?.remove();const link=document.createElement('a');link.href='../access/';link.textContent='Ir para o acesso';gate.append(link);}
 function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Falha ao carregar conexão'));document.head.append(script);});}
 function decorate(){
  document.querySelectorAll('[data-study],[data-questions],[data-exam-result]').forEach(b=>{b.disabled=!!writer?.blocked||(b.hasAttribute('data-study')&&!!writer?.busy);});
  for(const card of document.querySelectorAll('[data-exam]')){
   const e=facultyRecords.find(e=>e.id===card.dataset.exam);if(!e)continue;
   const empty=card.querySelector('.faculty-no-result');
   if(empty)empty.textContent=e.grade!=null?`Nota ${Number(e.grade).toLocaleString('pt-BR')}`:'Sem resultado';
  }
 }
 try{
  await loadScript('../access/workspace.js?v=connected-2');
  await loadScript('../access/projection.js?v=connected-1');
  await loadScript('../access/config.js?v=connected-1');
  await loadScript('../access/catalog-writes.js?v=2');
  await loadScript('../access/simulations.js?v=1');
  await loadScript('../access/personal-writes.js?v=6');
  await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js');
  client=supabase.createClient(PELEJA_ACCESS_CONFIG.url,PELEJA_ACCESS_CONFIG.key,{auth:{storageKey:'peleja-next-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  writer=PELEJA_PERSONAL_WRITES.createPersonalWriter(client,()=>currentSession?.user?.id,()=>isAdmin);
  app.dataset.previewRole='participant';

  $('settingsExport').closest('.settings-section').hidden=true;
  $('settingsFile').disabled=true;
  let confirmedPrefs={dark:false,motion:true};
  savePreviewPrefs=()=>{
   if(loading||writer.busy||writer.blocked){Object.assign(previewPrefs,confirmedPrefs);applyPreviewPrefs();toast('Aguarde ou sincronize antes de alterar as preferências','info');return;}
   const next={dark:previewPrefs.dark,motion:previewPrefs.motion};
   saveChange({kind:'preferences',preferences:next},()=>{confirmedPrefs=next;},null,()=>{Object.assign(previewPrefs,confirmedPrefs);applyPreviewPrefs();});
  };
  app.querySelector('.brand').href='../access/';
  const notice=document.createElement('div');notice.className='connection-notice';notice.innerHTML='<span></span>';app.querySelector('header').after(notice);
  const originalRender=renderContent;renderContent=function(){originalRender();decorate();};
  const originalFaculty=renderFacultyPage;renderFacultyPage=function(){originalFaculty();decorate();};
  isFacultyPerformed=e=>PELEJA_READ_WORKSPACE.examDone({...e,total:e.q},localQuestionDate());
  window.libraryExamCodes=(mode,subject)=>{
   let exams=facultyRecords.filter(e=>(!subject||e.subject===subject)&&!isFacultyPerformed(e));
   if(mode==='next'){const first=exams.filter(e=>e.date).sort((a,b)=>a.date.localeCompare(b.date))[0];exams=first?exams.filter(e=>e.date===first.date):[];}
   return [...new Set(exams.flatMap(e=>e.materialCodes))];
  };
  $('library').addEventListener('click',async event=>{
   const copy=event.target.closest('[data-hint]');if(!copy)return;event.preventDefault();event.stopImmediatePropagation();
   const item=data.find(m=>m.code===copy.closest('[data-row]')?.dataset.row);
   try{await navigator.clipboard.writeText(item?.ankiQuery||'');toast('NIDs copiados','created');}catch{toast('Não foi possível copiar os NIDs','info');}
  },true);
  function setSaving(active){
   notice.querySelector('span').textContent=active?'Salvando…':writer.blocked?'Atualize os dados antes de continuar':'';
   for(const id of ['questionsSave','mockSave','facultyDeleteResult','mockDeleteResult'])$(id).disabled=active;
   $('facultyForm').querySelector('[type=submit]').disabled=active;
   decorate();
  }
  async function saveChange(change,onSaved,errorId,onFailed){
   const owner=currentSession?.user?.id,ticket=version;
   if(writer.busy||writer.blocked)return;
   try{
    const request=writer.save(change);setSaving(true);const saved=await request;
    if(owner!==currentSession?.user?.id||ticket!==version)return;
    pendingConflict=null;onSaved(saved);
   }catch(error){
    if(owner!==currentSession?.user?.id||ticket!==version)return;
    onFailed?.();
    if(String(error.message).includes('CONFLICT'))pendingConflict={owner,change:structuredClone(change)};
    const text=String(error.message).includes('CONFLICT')?'Há mudanças em outro aparelho. Atualize antes de salvar novamente.':'Não foi possível confirmar o salvamento. Atualize para conferir antes de tentar novamente.';
    if(errorId){$(errorId).textContent=text;$(errorId).hidden=false;}toast(text,'info');
   }finally{if(owner===currentSession?.user?.id&&ticket===version){setSaving(false);if(writer.blocked)notice.querySelector('span').textContent='Atualize os dados antes de continuar';}}
  }
  const localToggle=toggleStudy;
  toggleStudy=button=>{
   if(writer.busy||writer.blocked)return;
   const m=data.find(x=>x.code===button.dataset.study);if(!m)return;
   const before=!!m.studied;
   // Respond within the click event; persistence does not delay the study animation.
   localToggle(button);
   saveChange({kind:'study',id:m.sourceId,studied:m.studied},()=>{},null,()=>{
    clearStudyEffects(button);m.studied=before;render();
   });
  };
  let recoveryDraft=null;
  const recoverButton=document.createElement('button');recoverButton.type='button';recoverButton.textContent='Recuperar registro';recoverButton.hidden=true;notice.append(recoverButton);
  function keepDraft(draft){recoveryDraft={...draft,owner:currentSession?.user?.id};recoverButton.hidden=false;}
  function clearDraft(){recoveryDraft=null;recoverButton.hidden=true;}
  recoverButton.onclick=async()=>{
   if(writer.busy||!recoveryDraft||recoveryDraft.owner!==currentSession?.user?.id)return;
   const draft=recoveryDraft;await refresh(currentSession);
   if(document.documentElement.classList.contains('connected-loading')||draft.owner!==currentSession?.user?.id)return;
   if(draft.kind==='round'){
    const m=draft.id?data.find(x=>x.sourceId===draft.id):standaloneQuestions;if(!m)return toast('Assunto não encontrado no catálogo atualizado','info');
    openQuestions(draft.id?m.code:null);resetQuestionFields(draft.round);
   }else{
    const e=facultyRecords.find(x=>x.sourceId===draft.id);if(!e)return toast('Prova não encontrada no catálogo atualizado','info');
    showFacultyPage();openFaculty(e.id,{resultOnly:true});$('facultyTotal').value=draft.q;$('facultyCorrect').value=draft.c;setConnectedResultMode(draft.grade!=null?'grade':'counts');$('facultyGrade').value=draft.grade??'';updateFacultyWrong();
   }
   toast('Valores recuperados · confira antes de concluir','edit');
  };
  function recount(m){const t=m.questionRounds.reduce((a,r)=>({q:a.q+r.q,c:a.c+r.c,w:a.w+r.w}),{q:0,c:0,w:0});Object.assign(m,t);}
  $('questionsForm').onsubmit=event=>{
   event.preventDefault();if(writer.busy||writer.blocked||!$('questionsDialog').open||!$('questionsForm').reportValidity()||!updateQuestionPreview())return;
   const m=currentQuestionSubject(),editing=!!questionRoundId;
   const round={id:questionRoundId||crypto.randomUUID(),date:$('questionsDate').value,q:Number($('questionsTotal').value),c:Number($('questionsCorrect').value)};round.w=round.q-round.c;if(!questionsCode){round.subject=$('questionsDiscipline').value;round.specialty=$('questionsSpecialty').value;}
   const before=structuredClone({q:m.q,c:m.c,w:m.w,questionRounds:m.questionRounds,questionBase:m.questionBase});
   const index=m.questionRounds.findIndex(r=>r.id===round.id);if(index>=0)m.questionRounds[index]=round;else m.questionRounds.push(round);recount(m);
   render();resetQuestionFields();closeQuestions(true);if(editing)toast('Rodada atualizada','edit');else celebrateQuestionRound(round);
   saveChange({kind:questionsCode?'round':'session',id:m.sourceId,round},()=>clearDraft(),null,()=>{clearQuestionCelebration();Object.assign(m,before);render();keepDraft({kind:'round',id:m.sourceId,round});});
  };
  const roundHistoryClick=$('questionsHistory').onclick;
  $('questionsHistory').onclick=event=>{
   const remove=event.target.closest('[data-round-delete]');if(!remove){roundHistoryClick(event);return;}
   const m=currentQuestionSubject(),id=remove.dataset.roundDelete;
   confirmPeleja('Excluir rodada?',()=>{
    if(writer.busy||writer.blocked)return;
    const before=structuredClone({q:m.q,c:m.c,w:m.w,questionRounds:m.questionRounds});
    m.questionRounds=m.questionRounds.filter(r=>r.id!==id);recount(m);render();renderQuestionHistory();resetQuestionFields();toast('Rodada excluída','trash');
    saveChange({kind:questionsCode?'delete-round':'delete-session',id:m.sourceId,roundId:id},()=>{},'questionsError',()=>{Object.assign(m,before);render();if($('questionsDialog').open)renderQuestionHistory();});
   },{description:'Os totais serão recalculados.',accept:'Excluir',destructive:true});
  };
  $('facultyForm').onsubmit=event=>{
   event.preventDefault();if(!facultyResultOnly){PELEJA_ADMIN_FACULTY(event);return;}if(writer.busy||writer.blocked||!facultyResultOnly||!$('facultyDialog').open||!$('facultyForm').reportValidity())return;
   const direct=document.querySelector('.connected-result-mode').dataset.mode==='grade',grade=Number($('facultyGrade').value);
   const exam=facultyRecords.find(e=>e.id===facultyId),q=Number($('facultyTotal').value),c=Number($('facultyCorrect').value);
   if(!exam||(direct?(!Number.isFinite(grade)||grade<0||grade>10):(!Number.isInteger(q)||!Number.isInteger(c)||q<1||c<0||c>q))){$('facultyError').textContent='Confira o total e os acertos.';$('facultyError').hidden=false;return;}
   const updated=exam.q!=null;
   const run=()=>{
    if(writer.busy||writer.blocked)return;
    const before=structuredClone(exam);let failed=false;
    Object.assign(exam,direct?{q:null,c:null,w:null,grade,performed:true,performedOverride:true}:{q,c,w:q-c,grade:null,performed:true,performedOverride:true});renderFacultyPage();
    closeFaculty(true,()=>{showFacultyPage();if(!failed){if(direct)toast('Nota salva','edit');else celebrateFacultyResult(exam,updated);}});
    saveChange(direct?{kind:'grade',id:exam.sourceId,grade}:{kind:'exam',id:exam.sourceId,q,c},()=>clearDraft(),null,()=>{failed=true;clearQuestionCelebration();Object.assign(exam,before);renderFacultyPage();keepDraft({kind:'exam',id:exam.sourceId,q,c,grade:direct?grade:null});});
   };
   if(direct&&exam.q!=null)confirmPeleja('Substituir o resultado por questões?',run,{description:'A nota direta substituirá a contagem de questões desta prova.',accept:'Salvar'});else if(!direct&&exam.grade!=null)confirmPeleja('Substituir a nota direta?',run,{description:'O resultado por questões substituirá a nota registrada anteriormente.',accept:'Salvar'});else run();
  };
  function hydrate(remote){
    const merged=PELEJA_READ_WORKSPACE.combineWorkspace(remote),projected=PELEJA_WORKSPACE_PROJECTION.projectWorkspace(merged);
    // Keep source IDs intact; use an unambiguous, selector-safe key only for rendering.
    const domKey=(prefix,id)=>prefix+Array.from(new TextEncoder().encode(id),n=>n.toString(16).padStart(2,'0')).join('');
    standaloneQuestions={...projected.questions,questionBase:{q:0,c:0,w:0}};
    data=projected.subjects.map(m=>({...m,questionBase:{q:0,c:0,w:0},sourceId:m.id,code:domKey('m-',m.id)}));
    facultyRecords=projected.exams.map(e=>({...e,sourceId:e.id,id:domKey('e-',e.id),materialCodes:e.materialCodes.map(id=>domKey('m-',id))}));
    const selectedSubject=$('subject').value;
    $('subject').replaceChildren(new Option('Todas as disciplinas',''),...[...new Set(data.map(m=>m.subject))].sort().map(s=>new Option(s,s)));
    if([...$('subject').options].some(o=>o.value===selectedSubject))$('subject').value=selectedSubject;
    const selected=$('exam').value||'next';$('exam').replaceChildren(...[['next','Próxima prova'],['pending','Provas pendentes'],['all','Todas as provas'],...[...new Set(facultyRecords.map(e=>e.type))].sort().map(s=>[s,s])].map(([v,t])=>new Option(t,v)));$('exam').value=[...$('exam').options].some(o=>o.value===selected)?selected:'all';
    courses?.hydrate(remote);render();renderFacultyPage();syncFilterControls();
  }
  dashboard=PELEJA_INSTALL_DASHBOARD({client,getUser:()=>currentSession?.user?.id,getName:()=>profileName});
  courses=PELEJA_INSTALL_COURSES({writer,allowed:()=>isAdmin,saveChange});
  PELEJA_INSTALL_ADMIN({writer,allowed:()=>isAdmin,saveChange,hydrate});
  simulations=PELEJA_INSTALL_SIMULATIONS({client,writer,getUser:()=>currentSession?.user?.id,allowed:()=>isAdmin,saveChange,setSaving,refreshAccount:()=>refresh(currentSession)});
  async function refresh(session,manual=false,silent=false){
   const view=['dashboardPage','extraPage','mockPage','performancePage','facultyPage'].find(id=>$(id)&&!$(id).hidden);
   const course=extraActive;
   const button=$('refresh');if(manual){button.classList.add('is-syncing');button.disabled=true;button.setAttribute('aria-busy','true');}
   const ticket=++version;if(recoveryDraft&&recoveryDraft.owner!==session?.user?.id)clearDraft();currentSession=session;if(pendingConflict?.owner!==session?.user?.id)pendingConflict=null;if(!manual)lockContent();loading=true;
   if(!session){loading=false;fail('Entre na sua conta para abrir a Biblioteca e as Provas.');return;}
   status.textContent='Carregando sua Biblioteca e suas Provas…';
   try{
    const access=await client.rpc('has_peleja_access');if(ticket!==version)return;
    if(access.error||access.data!==true)throw Error('Sua conta ainda não está autorizada.');
    const profile=await client.from('profiles').select('id,display_name,role').eq('id',session.user.id).maybeSingle();if(ticket!==version)return;if(profile.error)throw profile.error;
    const remote=await client.rpc('get_workspace');if(ticket!==version)return;if(remote.error)throw remote.error;
    confirmedPrefs={dark:false,motion:true,...remote.data.payload?.preferences?.pelejaNext};Object.assign(previewPrefs,confirmedPrefs);applyPreviewPrefs();
    hydrate(remote.data);
    profileName=profile.data?.display_name||'Conta';isAdmin=profile.data?.role==='admin';app.dataset.previewRole=isAdmin?'admin':'participant';
    $('profile').textContent=(profile.data?.display_name||'Conta').slice(0,1).toLocaleUpperCase('pt-BR');$('profile').setAttribute('aria-label',`Perfil de ${profile.data?.display_name||'usuário'}`);
    $('refresh').title='Sincronizar';$('refresh').setAttribute('aria-label','Sincronizar');
    writer.load(remote.data,session.user.id);showLibraryPage();render();renderFacultyPage();syncFilterControls();
    document.documentElement.classList.remove('connected-loading');if(!manual&&gate.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const exit=gate.animate([{opacity:1},{opacity:0}],{duration:240,easing:'ease-out'});exit.onfinish=()=>{if(ticket===version)gate.hidden=true;};}else gate.hidden=true;const results=await Promise.all([simulations.load(),dashboard.load()]);
    if(ticket!==version)return;
    if(manual){if(view==='dashboardPage')showDashboard();else if(view==='extraPage'){showExtraCourses();if(course)openExtraCourse(course);}else if(view==='facultyPage')showFacultyPage();else if(view==='mockPage')showMocks();else if(view==='performancePage')showGeneralRanking();if(!silent)toast(results.every(Boolean)?'Sincronizado':'Dados atualizados parcialmente · tente sincronizar novamente',results.every(Boolean)?'refresh':'info');}
    return true;
   }catch(error){if(manual){if(ticket===version)toast('Não foi possível sincronizar. Tente novamente.','info');}else if(ticket===version)fail(error.message==='Sua conta ainda não está autorizada.'?error.message:'Não foi possível carregar os dados. Volte ao acesso e tente novamente.');}
   finally{if(ticket===version)loading=false;if(manual){button.classList.remove('is-syncing');button.disabled=false;button.removeAttribute('aria-busy');}}
  }
  app.insertAdjacentHTML('beforeend',`<dialog id="syncConflictDialog" class="settings-dialog" aria-labelledby="syncConflictTitle"><div class="settings-heading"><h2 id="syncConflictTitle">Alterações em outro aparelho</h2><button type="button" class="icon" id="syncConflictClose" aria-label="Fechar">${svg('close')}</button></div><p>Escolha usar os dados atuais da nuvem ou reaplicar sua última alteração sobre eles. O restante do histórico será preservado.</p><div class="confirm-actions"><button type="button" class="editor-cancel" id="syncUseCloud">Usar a nuvem</button><button type="button" class="primary" id="syncRetry">Reaplicar alteração</button></div></dialog>`);
  $('syncConflictClose').onclick=()=>$('syncConflictDialog').close();
  async function resolveConflict(retry){
   const pending=pendingConflict;if(!pending||pending.owner!==currentSession?.user?.id)return;
   $('syncConflictDialog').close();const refreshed=await refresh(currentSession,true,retry);
   if(!refreshed)return;
   if(writer.blocked||loading||pending.owner!==currentSession?.user?.id)return;
   if(!retry){pendingConflict=null;clearDraft();return;}
   await saveChange(pending.change,remote=>{pendingConflict=null;clearDraft();if(pending.change.kind==='preferences'){confirmedPrefs={...pending.change.preferences};Object.assign(previewPrefs,confirmedPrefs);applyPreviewPrefs();}hydrate(remote);toast('Alteração sincronizada','refresh');},null,()=>{});
  }
  $('syncUseCloud').onclick=()=>resolveConflict(false);$('syncRetry').onclick=()=>resolveConflict(true);
  $('refresh').onclick=()=>{if(!loading&&!writer.busy){const run=()=>{if(pendingConflict?.owner===currentSession?.user?.id){$('syncConflictDialog').showModal();return;}refresh(currentSession,true);};if($('questionsDialog').open||$('facultyDialog').open||$('subjectDialog').open||$('mockDialog').open)confirmPeleja('Recarregar dados?',run,{description:'O formulário aberto será descartado.',accept:'Recarregar'});else run();}};
  $('profileExit').onclick=()=>{closeProfileMenu();confirmPeleja('Sair da conta?',async()=>{
   ++version;lockContent();status.textContent='Saindo…';const result=await client.auth.signOut({scope:'local'});
   if(result.error){fail('Não foi possível sair. Tente novamente pela tela de acesso.');return;}location.href='../access/';
  },{description:'Seu histórico permanece salvo.',accept:'Sair'});};
  client.auth.onAuthStateChange((event,session)=>{if(event==='TOKEN_REFRESHED')return;++version;lockContent();setTimeout(()=>refresh(session),0);});
 }catch{fail('Não foi possível conectar. Confira sua conexão e tente novamente.');}
})();
