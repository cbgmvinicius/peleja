// One in-app confirmation surface, including when another form is already modal.
let confirmationState=null,confirmationAnimation=null;
app.insertAdjacentHTML('beforeend',`<dialog id="confirmDialog" class="confirm-dialog" role="alertdialog" aria-labelledby="confirmTitle" aria-describedby="confirmDescription"><div class="confirm-symbol" id="confirmSymbol" aria-hidden="true"></div><h2 id="confirmTitle"></h2><p id="confirmDescription"></p><div class="confirm-actions"><button type="button" class="editor-cancel" id="confirmCancel">Cancelar</button><button type="button" class="primary" id="confirmAccept">Confirmar</button></div></dialog>`);
function confirmPeleja(title,action,{description='As alterações não salvas serão descartadas.',accept='Descartar',destructive=false}={}){
  if(confirmationState)return;
  if(typeof closeCalendar==='function')closeCalendar(true);if(typeof closeFilterOptions==='function')closeFilterOptions(true);
  const dialog=$('confirmDialog');confirmationAnimation?.cancel();dialog.classList.remove('is-closing');
  confirmationState={action,opener:document.activeElement,closing:false};$('confirmTitle').textContent=title;$('confirmDescription').textContent=description;$('confirmAccept').textContent=accept;$('confirmAccept').classList.toggle('danger',destructive);$('confirmSymbol').innerHTML=svg(destructive?'trash':'edit');
  dialog.showModal();$('confirmCancel').focus();confirmationAnimation=motion(dialog,[{opacity:0,transform:'translateY(6px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:200,easing:'cubic-bezier(.22,1,.36,1)'});
}
function finishConfirmation(accepted){
  const state=confirmationState;if(!state||state.closing)return;state.closing=true;
  const dialog=$('confirmDialog'),style=getComputedStyle(dialog),start={opacity:style.opacity,transform:style.transform};confirmationAnimation?.cancel();dialog.classList.add('is-closing');
  const finish=()=>{dialog.close();confirmationAnimation?.cancel();confirmationAnimation=null;confirmationState=null;dialog.classList.remove('is-closing');if(state.opener?.isConnected)state.opener.focus();if(accepted)state.action();};
  confirmationAnimation=motion(dialog,[start,{opacity:0,transform:'translateY(4px) scale(.98)'}],{duration:180,easing:'ease-in-out',fill:'both'});if(confirmationAnimation)confirmationAnimation.onfinish=finish;else finish();
}
$('confirmAccept').onclick=()=>finishConfirmation(true);$('confirmCancel').onclick=()=>finishConfirmation(false);
$('confirmDialog').addEventListener('cancel',event=>{event.preventDefault();finishConfirmation(false);});
$('confirmDialog').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finishConfirmation(false);}});
