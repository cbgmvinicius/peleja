// Pomodoro notifications only: it never handles fetch (no cache, no offline), so it cannot serve an old
// release. It shows the timer notifications the page asks for and passes the buttons back to the page.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
 const action=event.action||'open';
 event.notification.close();
 event.waitUntil((async()=>{
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const tab=tabs.find(t=>new URL(t.url).pathname.includes('/directions/'))||tabs[0];
  if(tab){
   if(action!=='open')tab.postMessage({type:'pomodoro-action',action});
   if(action==='open'||!tab.focused)try{await tab.focus();}catch{}
   return;
  }
  // Peleja closed: open it on the Pomodoro (the button itself cannot act without the page).
  await self.clients.openWindow(new URL('./#pomodoro',self.registration.scope).href);
 })());
});
