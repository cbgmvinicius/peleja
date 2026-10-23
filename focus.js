/* Server-timestamped focus sessions. No pause/end action is queued while offline. */
(() => {
  const $=id=>document.getElementById(id),store=globalThis.PELEJA_STORAGE;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data=null,active=null,epoch=0,busy=false,anchor=0,server=0,requestId=0;
  const statusNames={invited:'Aguardando confirmação',running:'Em foco',paused:'Pausado',ended:'Concluído',declined:'Convite cancelado'};
  const verbs={pause:'pausar',resume:'retomar',end:'encerrar'};
  const clock=ms=>{const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/3600)?Math.floor(s/3600)+':':''}${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
  function elapsed(s){return Number(s.elapsed_ms)+(s.running_since?Math.max(0,server+(performance.now()-anchor)-Date.parse(s.running_since)):0);}
  function tick(){if(!active)return;const ms=elapsed(active);$('focusClock').textContent=clock(ms);const ratio=active.planned_minutes?Math.min(1,ms/(active.planned_minutes*60000)):0;$('focusDial').style.setProperty('--focus-progress',`${ratio*360}deg`);$('focusGoal').textContent=active.planned_minutes?`${active.planned_minutes} min planejados${ratio===1?' · meta atingida':''}`:'Tempo livre';}
  function controls(){
    if(!active)return '';
    const button=(action,label,primary=false)=>`<button type="button" class="${primary?'primary-button':'ghost-button'}" data-focus-action="${action}">${label}</button>`;
    if(active.status==='invited')return (data.user_id===active.peer_id?button('accept','Começar juntos',true):'')+button('decline',data.user_id===active.peer_id?'Recusar':'Cancelar convite');
    if(active.pending_action){const mine=active.pending_by===data.user_id;return `<p>${mine?'Aguardando o outro participante confirmar':'Pedido para '+verbs[active.pending_action]+' a sessão'}</p>`+(mine?button('cancel','Cancelar pedido'):button('confirm','Confirmar',true)+button('reject','Continuar como está'));}
    return button(active.status==='running'?'pause':'resume',active.status==='running'?'Pausar':'Retomar',true)+button('end','Encerrar');
  }
  function render(){
    active=data?.sessions.find(s=>['invited','running','paused'].includes(s.status))||null;
    $('focusSetup').hidden=!!active;$('focusActive').hidden=!active;
    if(active){$('focusTitle').textContent=active.title;$('focusState').textContent=statusNames[active.status]+(active.peer_id?' · Em dupla':'');$('focusActions').innerHTML=controls();tick();}
    const history=(data?.sessions||[]).filter(s=>s.status==='ended');
    $('focusHistory').innerHTML=history.length?history.map(s=>`<div class="focus-history-row"><div><strong>${escape(s.title)}</strong><small>${new Date(s.created_at).toLocaleDateString('pt-BR')}${s.peer_id?' · Em dupla':''}</small></div><span>${clock(s.elapsed_ms)}</span></div>`).join(''):'<p class="muted">Suas sessões concluídas aparecerão aqui.</p>';
    const peerValue=$('focusPeer').value;$('focusPeer').replaceChildren(new Option('Sozinho',''),...(data?.peers||[]).map(p=>new Option(p.name,p.id)));$('focusPeer').value=peerValue||'';
    document.querySelector('[data-view="sessions"]').classList.toggle('has-invite',!!active&&(active.status==='invited'&&active.peer_id===data?.user_id||active.pending_by&&active.pending_by!==data?.user_id));
  }
  async function request(method,args){
    const version=epoch,id=++requestId;
    if(!globalThis.PELEJA_FOCUS)throw Error('Sessions ficará disponível ao conectar sua conta.');
    const result=await globalThis.PELEJA_FOCUS[method](args);
    if(version!==epoch||id!==requestId)return;
    const changed=JSON.stringify([data?.sessions,data?.peers])!==JSON.stringify([result.sessions,result.peers]);
    data=result;server=Date.parse(result.server_now);anchor=performance.now();if(changed||method!=='load')render();else tick();$('focusMessage').textContent='';
  }
  async function refresh(){if(busy||document.hidden)return;try{await request('load');}catch(e){$('focusMessage').textContent=active?'Sem conexão. O tempo continua contando; reconecte para alterar a sessão.':e.message;}}
  async function action(method,args){if(busy)return;busy=true;$('focusActions').querySelectorAll('button').forEach(b=>b.disabled=true);$('focusStart').disabled=true;try{await request(method,args);}catch(e){$('focusMessage').textContent=e.message;render();}finally{busy=false;$('focusStart').disabled=false;}}
  $('focusSetup').onsubmit=e=>{e.preventDefault();action('create',{p_title:$('focusSubject').value.trim(),p_minutes:Number($('focusMinutes').value),p_peer:$('focusPeer').value||null});};
  $('focusActions').onclick=e=>{const b=e.target.closest('[data-focus-action]');if(b&&active)action('act',{p_id:active.id,p_version:active.version,p_action:b.dataset.focusAction});};
  function subjects(){const current=$('focusSubject').value;const materials=JSON.parse(store.getItem('medstudy_materials_v1')||'[]');const labels=[...new Set(materials.map(m=>m.title))];$('focusSubject').replaceChildren(new Option('Escolha o assunto',''),...labels.map(v=>new Option(v,v)),new Option('Estudo livre','Estudo livre'));$('focusSubject').value=current||'';}
  window.addEventListener('peleja:view-changed',e=>{if(e.detail?.view==='sessions'){subjects();refresh();}});
  window.addEventListener('peleja:storage-changed',()=>{epoch++;data=null;active=null;render();subjects();$('focusMessage').textContent='';});
  window.addEventListener('peleja:access-changed',refresh);window.addEventListener('online',refresh);window.addEventListener('focus',refresh);
  setInterval(()=>{if(globalThis.PELEJA_ACCESS?.signedIn||document.body.hasAttribute('data-preview'))refresh();},10000);
  setInterval(tick,1000);subjects();render();
})();
