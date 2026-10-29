/* Account-scoped appearance. Tutorial paused pending redesign. */
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
  for(const id of ['settingsModal']){$(id).addEventListener('click',e=>{if(e.target===$(id))close(id);});}
  $('closeSettings').onclick=()=>close('settingsModal');
  window.addEventListener('peleja:storage-changed',()=>{close('settingsModal');$('profileMenu').open=false;apply();});
  window.addEventListener('peleja:access-changed',()=>{mirror();apply();});
  const avatar=$('accountAvatar');
  const mirror=()=>{$('profileAvatar').replaceChildren(...(globalThis.PELEJA_ACCESS?.signedIn&&avatar?.childNodes.length?[...avatar.childNodes].map(n=>n.cloneNode(true)):[document.createTextNode('P')]));};
  if(avatar)new MutationObserver(mirror).observe(avatar,{childList:true,subtree:true});mirror();
  document.addEventListener('click',e=>{if(!$('profileMenu').contains(e.target))$('profileMenu').open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$('profileMenu').open=false;});
  apply();
})();
