// Keeps open pages on the published release without anyone clearing the cache.
// The build writes <meta name="peleja-release"> into each page and release.json at the site root;
// when they differ, the page reloads by itself, or offers a button while something is in progress.
(()=>{
 const current=document.querySelector('meta[name="peleja-release"]')?.content;
 if(!current||current==='local')return; // development copies have nothing to compare
 const url=new URL('../../release.json',location.href);
 let offered=false,checking=false;
 const reload=()=>(globalThis.PELEJA_RELOAD||(()=>location.reload()))();
 // Automatic attempts per release, so a browser that keeps serving the cached page cannot loop:
 // 1st a plain reload, 2nd a fresh address (?r=<release>) that skips the cache, then only the button.
 let target='';
 function goToRelease(){
  const key='peleja-release-tries';let tries={};try{tries=JSON.parse(sessionStorage.getItem(key)||'{}');}catch{}
  const n=(tries[target]||0)+1;try{sessionStorage.setItem(key,JSON.stringify({[target]:n}));}catch{}
  if(n===1){reload();return true;}
  if(n===2){const next=new URL(location.href);next.searchParams.set('r',target.slice(0,8));(globalThis.PELEJA_RELOAD_TO||(href=>location.replace(href)))(next.href);return true;}
  return false;
 }
 // Work in progress: an open dialog, a filled field or a page-specific guard.
 const busy=()=>!!document.querySelector('dialog[open]')||[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea')].some(f=>f.value&&f.closest('form,dialog')&&!f.closest('[hidden]'))||!!globalThis.PELEJA_UPDATE_BLOCKED?.();
 function banner(text,action){
  document.getElementById('pelejaUpdate')?.remove();
  const box=document.createElement('div');box.id='pelejaUpdate';box.setAttribute('role','status');
  box.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 18px;border-radius:24px;background:#2b332c;color:#f5f4ef;font:14px/1.4 Peleja,Arial,sans-serif;box-shadow:0 10px 40px #0004;max-width:calc(100% - 32px)';
  box.append(text);
  if(action){const b=document.createElement('button');b.type='button';b.textContent='Atualizar';b.style.cssText='border:0;border-radius:18px;padding:7px 14px;background:#f3dfc1;color:#2b332c;font:inherit;font-weight:600;cursor:pointer';b.onclick=action;box.append(b);}
  document.body.append(box);
 }
 function update(){
  // During the opening animation nothing is on screen yet: go straight to the new release.
  if(document.querySelector('.peleja-entry:not([hidden])')&&!document.querySelector('.peleja-entry.entry-error')){if(goToRelease())return;}
  else if(!busy()){banner('Atualizando o Peleja…');setTimeout(()=>{if(!goToRelease())banner('Há uma versão nova do Peleja.',reload);},700);return;}
  if(offered)return;offered=true;
  banner('Há uma versão nova do Peleja.',reload);
 }
 async function check(){
  if(checking||document.hidden)return;checking=true;
  try{
   const response=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
   if(!response.ok)return;
   const {commit}=await response.json();
   if(commit&&commit!=='local'&&commit!==current){target=commit;update();}
  }catch{}finally{checking=false;}
 }
 check(); // right away, while the opening animation loads the data
 setInterval(check,10*60*1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
 globalThis.PELEJA_CHECK_RELEASE=check;
})();
