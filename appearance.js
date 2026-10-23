/* Account-scoped appearance and a short, repeatable introduction. */
(() => {
  const $=id=>document.getElementById(id), store=globalThis.PELEJA_STORAGE;
  const key='peleja_preferences_v1';
  const preferences=()=>JSON.parse(store.getItem(key)||'{}');
  const save=patch=>{if(!store.writable)return;store.setItem(key,JSON.stringify({...preferences(),...patch}));window.dispatchEvent(new CustomEvent('peleja:data-changed',{detail:{kind:'preferences'}}));};
  const open=id=>{$(id).classList.add('open');$(id).setAttribute('aria-hidden','false');};
  const close=id=>{$(id).classList.remove('open');$(id).setAttribute('aria-hidden','true');};
  const preview=document.body.hasAttribute('data-preview');
  function apply(){const p=preferences();document.documentElement.dataset.theme=p.theme||'light';document.body.dataset.layout=p.layout||(preview?'top':'side');$('appearanceTheme').value=p.theme||'light';$('appearanceLayout').value=p.layout||(preview?'top':'side');}
  const actions=document.createElement('div');actions.className='header-actions';
  const primary=$('primaryActionBtn').closest('.new-event-control');
  primary.parentNode.insertBefore(actions,primary);actions.append($('refreshStudyProgress'),primary,$('profileMenu'));
  if(preview){$('sidebar').append(actions);document.querySelector('.topbar').hidden=true;}
  $('profileSettings').onclick=()=>{$('profileMenu').open=false;apply();open('settingsModal');};
  $('profileLogout').onclick=()=>{$('profileMenu').open=false;if(preview){$('settingsMessage').textContent='Prévia local: nenhuma conta conectada.';open('settingsModal');}else $('logoutButton').click();};
  $('settingsAccount').onclick=()=>{close('settingsModal');$('accountButton').click();};
  $('settingsExport').onclick=()=>$('exportBtn').click();
  $('settingsImport').onclick=()=>$('importInput').click();
  $('appearanceTheme').onchange=e=>{save({theme:e.target.value});apply();};
  $('appearanceLayout').onchange=e=>{save({layout:e.target.value});apply();};
  for(const id of ['settingsModal','tutorialModal']){$(id).addEventListener('click',e=>{if(e.target===$(id))close(id);});}
  $('closeSettings').onclick=()=>close('settingsModal');
  let step=0,invitedScope=null;
  const steps=[
    ['Seu ritmo, num lugar só','No Painel, acompanhe o estudo da turma e o que falta para as próximas provas.','dashboard'],
    ['Biblioteca','Filtre por disciplina e prova. Marque o que estudou; registre questões pelo ícone de alvo.','materials'],
    ['Novo evento','Use + Novo evento para cadastrar assuntos, questões, provas da faculdade e simulados de residência. As opções dependem do seu perfil.','materials'],
    ['Resultados','Em Provas e Simulados, registre seus resultados. No Ranking, compare o recorte que escolher.','ranking'],
    ['Cursos e preferências','Marque suas aulas em Cursos extras. Pelo seu perfil, altere a aparência, guarde backups ou reveja este tutorial.','courses'],
  ];
  function renderStep(){$('tutorialTitle').textContent=steps[step][0];$('tutorialText').textContent=steps[step][1];$('tutorialCount').textContent=`${step+1} / ${steps.length}`;$('tutorialBack').hidden=step===0;$('tutorialNext').textContent=step===steps.length-1?'Concluir':'Próximo';}
  function tutorial(){step=0;renderStep();open('tutorialModal');}
  function finish(){save({tutorialSeen:true});close('tutorialModal');}
  $('profileTutorial').onclick=()=>{$('profileMenu').open=false;tutorial();};
  $('closeTutorial').onclick=finish;$('tutorialNext').onclick=()=>{if(step===steps.length-1){finish();return;}step++;renderStep();};$('tutorialBack').onclick=()=>{step=Math.max(0,step-1);renderStep();};
  function invite(){apply();if(store.writable&&(store.isLocalOwner||globalThis.PELEJA_ACCESS?.accessAllowed)&&!preferences().tutorialSeen&&invitedScope!==store.scope){invitedScope=store.scope;tutorial();}}
  window.addEventListener('peleja:storage-changed',()=>{close('settingsModal');close('tutorialModal');$('profileMenu').open=false;invite();});
  window.addEventListener('peleja:access-changed',()=>{mirror();invite();});
  const avatar=$('accountAvatar');
  const mirror=()=>{$('profileAvatar').replaceChildren(...(globalThis.PELEJA_ACCESS?.signedIn&&avatar?.childNodes.length?[...avatar.childNodes].map(n=>n.cloneNode(true)):[document.createTextNode('P')]));};
  if(avatar)new MutationObserver(mirror).observe(avatar,{childList:true,subtree:true});mirror();
  document.addEventListener('click',e=>{if(!$('profileMenu').contains(e.target))$('profileMenu').open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$('profileMenu').open=false;});
  apply();if(!preview)invite();
})();
