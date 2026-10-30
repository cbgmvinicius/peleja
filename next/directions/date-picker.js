// Shared animated calendar; date inputs remain the form's validated source of truth.
let calendarInput=null,calendarMonth=null,calendarAnimation=null;
const calendar=document.createElement('section');calendar.className='date-calendar';calendar.id='dateCalendar';calendar.hidden=true;calendar.setAttribute('role','dialog');calendar.setAttribute('aria-label','Escolher data');
document.body.append(calendar);
const calendarISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function closeCalendar(immediate=false,refocus=false){
  if(!calendarInput&&(calendar.hidden||!immediate))return;
  const input=calendarInput;calendarInput=null;input?.parentElement.querySelector('.date-trigger')?.setAttribute('aria-expanded','false');
  const current=getComputedStyle(calendar);
  const start={opacity:current.opacity,transform:current.transform,clipPath:current.clipPath};
  calendarAnimation?.cancel();
  const finish=()=>{calendar.hidden=true;calendarAnimation=null;};
  if(immediate)finish();else{calendarAnimation=motion(calendar,[start,{opacity:0,transform:'translateY(-5px)',clipPath:'inset(0 0 90% 0 round 16px)'}],{duration:230,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});if(calendarAnimation)calendarAnimation.onfinish=finish;else finish();}
  if(refocus)input?.parentElement.querySelector('.date-trigger')?.focus();
}
function renderCalendar(focusDate=null){
  if(!calendarInput)return;
  const month=calendarMonth.getMonth(),year=calendarMonth.getFullYear(),first=new Date(year,month,1),start=new Date(year,month,1-((first.getDay()+6)%7));
  calendar.innerHTML=`<div class="date-calendar-head"><button type="button" data-month="-1" aria-label="Mês anterior">‹</button><strong aria-live="polite">${first.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong><button type="button" data-month="1" aria-label="Próximo mês">›</button></div><div class="date-weekdays" aria-hidden="true">${['S','T','Q','Q','S','S','D'].map(x=>`<span>${x}</span>`).join('')}</div><div class="date-days"></div><button type="button" class="date-today">Hoje</button>`;
  const today=calendarISO(new Date());
  for(let i=0;i<42;i++){
    const date=new Date(start);date.setDate(start.getDate()+i);const iso=calendarISO(date),button=document.createElement('button');button.type='button';button.dataset.date=iso;button.textContent=date.getDate();button.className=date.getMonth()!==month?'outside':'';
    button.setAttribute('aria-label',date.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'}));button.setAttribute('aria-pressed',String(iso===calendarInput.value));if(iso===today)button.setAttribute('aria-current','date');
    button.disabled=!!((calendarInput.min&&iso<calendarInput.min)||(calendarInput.max&&iso>calendarInput.max));button.tabIndex=iso===(focusDate||calendarInput.value||today)?0:-1;calendar.querySelector('.date-days').append(button);
  }
  if(!calendar.querySelector('.date-days button[tabindex="0"]'))calendar.querySelector('.date-days button:not(.outside):not(:disabled)')?.setAttribute('tabindex','0');
  if(focusDate)calendar.querySelector(`[data-date="${focusDate}"]`)?.focus();
}
function positionCalendar(){
  if(!calendarInput)return;
  const rect=calendarInput.getBoundingClientRect(),width=Math.min(304,document.documentElement.clientWidth-24);calendar.style.width=width+'px';calendar.style.maxHeight=Math.max(180,innerHeight-24)+'px';
  const height=calendar.getBoundingClientRect().height;calendar.style.left=Math.max(12,Math.min(rect.left,document.documentElement.clientWidth-width-12))+'px';calendar.style.top=Math.max(12,Math.min(rect.bottom+6,innerHeight-height-12))+'px';
}
function openCalendar(input){
  if(input.disabled||input.readOnly)return;
  if(calendarInput===input){closeCalendar();return;}
  closeCalendar(true);calendarAnimation?.cancel();calendarInput=input;
  (input.closest('dialog')||document.body).append(calendar);
  const theme=getComputedStyle(app);['--surface','--ink','--muted','--line','--soft','--accent','--button','--onbutton'].forEach(key=>calendar.style.setProperty(key,theme.getPropertyValue(key)));
  const selected=input.value?new Date(input.value+'T12:00:00'):new Date();calendarMonth=new Date(selected.getFullYear(),selected.getMonth(),1);renderCalendar();calendar.hidden=false;positionCalendar();
  input.parentElement.querySelector('.date-trigger').setAttribute('aria-expanded','true');
  calendarAnimation=motion(calendar,[{opacity:0,transform:'translateY(-4px)',clipPath:'inset(0 0 90% 0 round 16px)'},{opacity:1,transform:'translateY(0)',clipPath:'inset(0 round 16px)'}],{duration:230,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'});
  calendar.querySelector('.date-days button[tabindex="0"]')?.focus({preventScroll:true});
}
function chooseCalendarDate(iso){
  const input=calendarInput;if(!input||(input.min&&iso<input.min)||(input.max&&iso>input.max))return;
  input.value=iso;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));closeCalendar(false,true);
}
calendar.onclick=event=>{
  const day=event.target.closest('[data-date]'),month=event.target.closest('[data-month]');
  if(day&&!day.disabled)chooseCalendarDate(day.dataset.date);
  else if(month){const delta=Number(month.dataset.month);calendarMonth.setMonth(calendarMonth.getMonth()+delta);renderCalendar();calendar.querySelector(`[data-month="${delta}"]`).focus();}
  else if(event.target.closest('.date-today'))chooseCalendarDate(calendarISO(new Date()));
};
calendar.onkeydown=event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeCalendar(false,true);return;}
  const button=event.target.closest('[data-date]');if(!button)return;
  const steps={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(!(event.key in steps))return;
  event.preventDefault();const date=new Date(button.dataset.date+'T12:00:00');date.setDate(date.getDate()+steps[event.key]);const iso=calendarISO(date);if((calendarInput.min&&iso<calendarInput.min)||(calendarInput.max&&iso>calendarInput.max))return;
  calendarMonth=new Date(date.getFullYear(),date.getMonth(),1);renderCalendar(iso);
};
for(const input of document.querySelectorAll('input[type=date]')){
  const wrap=document.createElement('div');wrap.className='date-field';input.before(wrap);wrap.append(input);
  const button=document.createElement('button');button.type='button';button.className='date-trigger';button.innerHTML=svg('calendar');button.setAttribute('aria-label','Abrir calendário');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',calendar.id);button.setAttribute('aria-expanded','false');wrap.append(button);button.onclick=()=>openCalendar(input);
  input.addEventListener('click',event=>{event.preventDefault();openCalendar(input);});
  input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&event.altKey){event.preventDefault();openCalendar(input);}});
  input.closest('dialog')?.addEventListener('close',()=>closeCalendar(true));
}
document.addEventListener('pointerdown',event=>{if(calendarInput&&!calendar.contains(event.target)&&!calendarInput.parentElement.contains(event.target))closeCalendar();},true);
document.addEventListener('focusin',event=>{if(calendarInput&&!calendar.contains(event.target)&&!calendarInput.parentElement.contains(event.target))closeCalendar();});
window.addEventListener('resize',positionCalendar);document.addEventListener('scroll',positionCalendar,true);
