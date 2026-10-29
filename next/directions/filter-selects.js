// Shared animated dropdowns for page filters and form fields. Native selects remain the data source.
const filterControls=[];
let openFilter=null,filterPopupAnimation=null,filterTypeBuffer='',filterTypeTimer;
const filterPopup=document.createElement('div');filterPopup.id='filterOptionsPopup';filterPopup.className='filter-options-popup';filterPopup.setAttribute('role','listbox');filterPopup.hidden=true;document.body.append(filterPopup);
function syncFilterControls(){
  for(const control of filterControls){
    const option=control.select.options[control.select.selectedIndex];control.label.textContent=option?.textContent||'Selecione';control.button.disabled=control.select.disabled;
    control.button.setAttribute('aria-label',`${control.select.getAttribute('aria-label')||document.getElementById(control.select.getAttribute('aria-labelledby'))?.textContent||'Selecionar'}: ${control.label.textContent}`);
  }
}
function closeFilterOptions(immediate=false){
  if(!openFilter)return;const control=openFilter;openFilter=null;clearTimeout(filterTypeTimer);filterTypeBuffer='';
  control.button.setAttribute('aria-expanded','false');control.button.removeAttribute('aria-activedescendant');filterPopupAnimation?.cancel();
  const finish=()=>{filterPopup.hidden=true;filterPopupAnimation=null;};
  if(immediate){finish();return;}
  filterPopupAnimation=motion(filterPopup,[{opacity:1,transform:'translateY(0)',clipPath:'inset(0 round 14px)'},{opacity:0,transform:'translateY(-3px)',clipPath:'inset(0 0 80% 0 round 14px)'}],{duration:150,easing:'ease-in',fill:'both'});
  if(filterPopupAnimation)filterPopupAnimation.onfinish=finish;else finish();
}
function activateFilterOption(index,scroll=true){
  const control=openFilter;if(!control)return;
  const options=[...control.select.options],enabled=options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);if(!enabled.length)return;
  filterPopup.children[control.active]?.classList.remove('active');
  control.active=enabled.includes(index)?index:enabled[0];
  filterPopup.children[control.active]?.classList.add('active');
  const active=filterPopup.children[control.active];control.button.setAttribute('aria-activedescendant',active.id);if(scroll)active.scrollIntoView?.({block:'nearest'});
}
function chooseFilterOption(index){
  const control=openFilter;if(!control||control.select.options[index]?.disabled)return;
  control.select.selectedIndex=index;control.select.dispatchEvent(new Event('change',{bubbles:true}));syncFilterControls();closeFilterOptions();control.button.focus();
}
function showFilterOptions(control){
  if(control.select.disabled)return;
  if(typeof closeCalendar==='function')closeCalendar(true);
  if(openFilter===control){closeFilterOptions();return;}
  closeFilterOptions(true);filterPopupAnimation?.cancel();filterPopupAnimation=null;
  openFilter=control;(control.select.closest('dialog')||document.body).append(filterPopup);filterPopup.replaceChildren();
  const theme=getComputedStyle(app);['--surface','--ink','--muted','--line','--soft','--accent'].forEach(key=>filterPopup.style.setProperty(key,theme.getPropertyValue(key)));
  [...control.select.options].forEach((option,index)=>{
    const item=document.createElement('div');item.id=`filter-option-${control.select.id}-${index}`;item.setAttribute('role','option');item.dataset.index=index;item.setAttribute('aria-selected',String(option.selected));
    if(option.disabled)item.setAttribute('aria-disabled','true');
    const text=document.createElement('span');text.textContent=option.textContent;const mark=document.createElement('span');mark.className='filter-option-mark';mark.innerHTML=svg('check');item.append(text,mark);filterPopup.append(item);
  });
  filterPopup.setAttribute('aria-label',control.select.getAttribute('aria-label')||'Opções');filterPopup.hidden=false;control.button.setAttribute('aria-expanded','true');
  const box=control.button.getBoundingClientRect(),width=Math.min(Math.max(box.width,200),document.documentElement.clientWidth-24);
  filterPopup.style.width=`${width}px`;filterPopup.style.maxHeight='280px';
  const natural=filterPopup.getBoundingClientRect().height,below=window.innerHeight-box.bottom-12,above=box.top-12,up=below<Math.min(natural,160)&&above>below;
  filterPopup.style.maxHeight=`${Math.max(60,Math.min(280,up?above-8:below-8))}px`;
  const height=filterPopup.getBoundingClientRect().height;filterPopup.style.left=`${Math.max(12,Math.min(box.left,document.documentElement.clientWidth-width-12))}px`;filterPopup.style.top=`${up?Math.max(12,box.top-height-6):box.bottom+6}px`;
  activateFilterOption(control.select.selectedIndex);
  filterPopupAnimation=motion(filterPopup,[{opacity:0,transform:`translateY(${up?4:-4}px)`,clipPath:up?'inset(90% 0 0 0 round 14px)':'inset(0 0 90% 0 round 14px)'},{opacity:1,transform:'translateY(0)',clipPath:'inset(0 round 14px)'}],{duration:230,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'});
}
function initFilterControls(root=document){
for(let i=filterControls.length-1;i>=0;i--)if(!filterControls[i].select.isConnected)filterControls.splice(i,1);
for(const select of root.querySelectorAll('.filters select,.editor-field select')){
  if(filterControls.some(control=>control.select===select))continue;
  const wrap=document.createElement('div');wrap.className='filter-select';select.before(wrap);wrap.append(select);select.classList.add('native-filter-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const button=document.createElement('button');button.type='button';button.id=`${select.id}Trigger`;button.className='filter-select-trigger';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',filterPopup.id);
  const label=document.createElement('span');button.append(label);const arrow=document.createElement('span');arrow.className='filter-select-arrow';arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m7 10 5 5 5-5"/></svg>';button.append(arrow);wrap.append(button);
  const control={select,button,label,active:select.selectedIndex};filterControls.push(control);button.onclick=()=>showFilterOptions(control);
  button.onkeydown=event=>{
    const enabled=[...select.options].map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();if(openFilter!==control){showFilterOptions(control);if(event.key==='ArrowDown'||event.key==='ArrowUp')return;}
      const current=enabled.indexOf(control.active),next=event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):enabled[Math.max(0,Math.min(enabled.length-1,current+(event.key==='ArrowDown'?1:-1)))];activateFilterOption(next);
    }else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(openFilter===control)chooseFilterOption(control.active);else showFilterOptions(control);}
    else if(event.key==='Escape'&&openFilter){event.preventDefault();event.stopPropagation();closeFilterOptions();}
    else if(event.key==='Tab')closeFilterOptions(true);
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();if(openFilter!==control)showFilterOptions(control);clearTimeout(filterTypeTimer);filterTypeBuffer+=event.key.toLocaleLowerCase('pt-BR');const match=enabled.find(i=>select.options[i].textContent.toLocaleLowerCase('pt-BR').startsWith(filterTypeBuffer));if(match!==undefined)activateFilterOption(match);filterTypeTimer=setTimeout(()=>filterTypeBuffer='',650);
    }
  };
  select.addEventListener('focus',()=>{syncFilterControls();button.focus();});
  select.addEventListener('invalid',event=>{event.preventDefault();button.setAttribute('aria-invalid','true');button.focus();showFilterOptions(control);});
  select.addEventListener('change',()=>button.removeAttribute('aria-invalid'));
  select.closest('dialog')?.addEventListener('close',()=>{if(openFilter?.select.closest('dialog')===select.closest('dialog'))closeFilterOptions(true);});
  new MutationObserver(()=>{syncFilterControls();if(openFilter===control)closeFilterOptions(true);}).observe(select,{childList:true,subtree:true,attributes:true});
}
syncFilterControls();
}
initFilterControls();
filterPopup.onpointerdown=event=>event.preventDefault();
filterPopup.onpointermove=event=>{const option=event.target.closest('[role=option]');if(option&&openFilter&&openFilter.active!==Number(option.dataset.index))activateFilterOption(Number(option.dataset.index),false);};
filterPopup.onclick=event=>{const option=event.target.closest('[role=option]');if(option)chooseFilterOption(Number(option.dataset.index));};
document.addEventListener('pointerdown',event=>{if(openFilter&&!filterPopup.contains(event.target)&&!openFilter.button.contains(event.target))closeFilterOptions();});
document.addEventListener('focusin',event=>{if(openFilter&&!filterPopup.contains(event.target)&&!openFilter.button.contains(event.target))closeFilterOptions();});
['click','change','input'].forEach(type=>document.addEventListener(type,()=>queueMicrotask(syncFilterControls)));
window.addEventListener('resize',()=>closeFilterOptions(true));
window.addEventListener('scroll',event=>{if(!filterPopup.contains(event.target))closeFilterOptions(true);},true);
syncFilterControls();
