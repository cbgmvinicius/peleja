const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000;

async function app(opts={}){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=Date.parse('2026-11-05T12:00:00Z');w.PELEJA_NOW=()=>clock;
 // Capacitor shell with the PelejaTimer plugin (android-app/): no web Notification, no service worker.
 const calls=[],queue=[],listeners={};
 const perms={usage:false,overlay:false};
 const plugin={notifyStatus:async()=>{if(opts.native==='old')throw Error('not implemented');return {...opts.native};},requestNotify:async()=>{calls.push(['requestNotify']);if(opts.native.canAsk&&opts.grantOnAsk)opts.native={granted:true,canAsk:false};return {...opts.native};},openNotifySettings:async()=>{calls.push(['openNotifySettings']);},update:async plan=>{calls.push(['update',JSON.parse(JSON.stringify(plan))]);},stop:async()=>{calls.push(['stop']);},
  blockStatus:async()=>({...perms}),openBlockSettings:async o=>{calls.push(['openBlockSettings',o.which]);},
  listApps:async()=>({apps:[{id:'com.whatsapp',label:'WhatsApp',icon:''},{id:'com.android.chrome',label:'Chrome',icon:''},{id:'com.spotify.music',label:'Spotify',icon:''}]}),
  drain:async()=>({actions:queue.splice(0)}),addListener:(name,fn)=>{(listeners[name]||=[]).push(fn);return {remove(){}};}};
 if(opts.native)w.Capacitor={isNativePlatform:()=>true,isPluginAvailable:name=>name==='PelejaTimer',
  nativePromise:(name,method,options)=>{assert.equal(name,'PelejaTimer');return plugin[method](options);},
  addListener:(name,event,fn)=>{assert.equal(name,'PelejaTimer');return plugin.addListener(event,fn);}};
if(!opts.native){const N=class{};N.permission=opts.web||'default';N.asked=0;N.requestPermission=async()=>{N.asked++;if(opts.answer)N.permission=opts.answer;return N.permission;};w.Notification=N;
  w.navigator.serviceWorker&&Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>({}),ready:Promise.resolve({showNotification:async()=>{},getNotifications:async()=>[]}),getRegistration:async()=>null},configurable:true});}
 try{w.localStorage.setItem('peleja-pomodoro-v1',JSON.stringify({prefs:{effects:false,notify:true}}));}catch{}
 // Audio stub: records every sound created, its volume and whether it is playing.
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;this.loop=false;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[],simulations:[],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[]}};
 const saved=[],wsSaves=[];let failSave=false;
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine'||name==='pomodoro_blocks_mine')return {data:[]};
  if(name==='save_workspace'){remote.payload=structuredClone(args.p_payload);remote.revision++;wsSaves.push(args.p_payload);return {data:{revision:remote.revision,catalog_revision:1}};}
  if(name==='pomodoro_block_save'){if(failSave)throw Error('offline');saved.push(args);return {data:null};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {w,$:id=>w.document.getElementById(id),P:w.PELEJA_POMODORO,calls};
}
(async()=>{
 const note=a=>a.$('pomoNotifyNote'),sw=a=>a.$('pomoPrefNotify'),toggle=async(a,on)=>{sw(a).checked=on;sw(a).dispatchEvent(new a.w.Event('change',{bubbles:true}));await tick(60);};
 // Web, not asked yet: say so, "Permitir" asks, allowed hides the note.
 let a=await app({web:'default',answer:'granted'});await tick(60);
 assert.equal(note(a).hidden,false);assert.match(note(a).textContent,/Falta o navegador permitir/);assert.equal(a.$('pomoNotifyFix').textContent,'Permitir');
 a.$('pomoNotifyFix').click();await tick(80);assert.equal(a.w.Notification.asked,1);assert.equal(note(a).hidden,true,'allowed: nothing to say');assert.equal(sw(a).checked,true);a.w.close();
 // Web, blocked: the switch shows off and the note says how to unblock; turning it on does not pretend.
 a=await app({web:'denied'});await tick(60);
 assert.equal(sw(a).checked,false,'blocked shows off');assert.match(note(a).textContent,/Bloqueado neste navegador.*cadeado/);assert.equal(a.$('pomoNotifyFix').hidden,true);
 await toggle(a,true);assert.equal(sw(a).checked,false,'still blocked: back to off');assert.equal(a.P.state().prefs.notify,false);assert.equal(note(a).hidden,false);a.w.close();
 // Web, asked on turning on and refused: off again, with the explanation (not a toast that goes away).
 a=await app({web:'default',answer:'denied'});await tick(60);await toggle(a,false);await toggle(a,true);
 assert.equal(a.w.Notification.asked,1);assert.equal(sw(a).checked,false);assert.match(note(a).textContent,/Bloqueado/);a.w.close();
 // Android app, off for the Peleja and no prompt left: "Abrir ajustes" opens the app's notification settings.
 a=await app({native:{granted:false,canAsk:false}});await tick(80);
 assert.equal(sw(a).checked,false);assert.match(note(a).textContent,/desligadas para o Peleja no Android/);assert.equal(a.$('pomoNotifyFix').textContent,'Abrir ajustes');
 a.$('pomoNotifyFix').click();await tick(60);assert.ok(a.calls.some(c=>c[0]==='openNotifySettings'));a.w.close();
 // Android app, can still ask: turning on asks the system, and allowed hides the note.
 a=await app({native:{granted:false,canAsk:true},grantOnAsk:true});await tick(80);await toggle(a,true);
 assert.ok(a.calls.some(c=>c[0]==='requestNotify'));assert.equal(sw(a).checked,true);assert.equal(note(a).hidden,true);a.w.close();
 // Older app without these methods: a general hint, the switch stays as chosen.
 a=await app({native:'old'});await tick(80);assert.equal(sw(a).checked,true);assert.match(note(a).textContent,/configurações do Android/);assert.equal(a.$('pomoNotifyFix').hidden,true);a.w.close();
 console.log('PASS pomodoro notify permission: web not asked / allowed / blocked / refused, Android off (open settings) / can ask / older app, switch never pretends');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
