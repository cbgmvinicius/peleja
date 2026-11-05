const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../next/release-check.js'),'utf8');
const tick=ms=>new Promise(r=>setTimeout(r,ms));
// Runs the checker on a page of release `page` while the server publishes `server`.
async function page({page='aaa',server='bbb',body='',status=200}={}){
 const dom=new JSDOM(`<!doctype html><html><head>${page?`<meta name="peleja-release" content="${page}">`:''}</head><body>${body}</body></html>`,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://cbgmvinicius.github.io/peleja/next/directions/#painel'}),w=dom.window;
 const fetches=[],reloads=[];
 w.fetch=async(url,options)=>{fetches.push([String(url),options]);return {ok:status===200,json:async()=>({commit:server})};};
 w.PELEJA_RELOAD=()=>reloads.push(1);
 w.setInterval=()=>0;const later=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>later(fn,ms===4000?0:ms);
 w.eval(source);await tick(30);
 return {w,fetches,reloads,banner:()=>w.document.getElementById('pelejaUpdate')};
}
(async()=>{
 // New release, nothing in progress: reloads by itself, release.json read without cache.
 let p=await page();
 assert.equal(p.fetches.length,1);assert.match(p.fetches[0][0],/^https:\/\/cbgmvinicius\.github\.io\/peleja\/release\.json\?t=\d+$/);assert.equal(p.fetches[0][1].cache,'no-store');
 assert.match(p.banner().textContent,/Atualizando o Peleja/);await tick(800);assert.equal(p.reloads.length,1);p.w.close();
 // Opening animation on screen: goes straight to the new release, no waiting.
 p=await page({body:'<section class="peleja-entry" role="status"><p>Entrando no Peleja…</p></section>'});assert.equal(p.reloads.length,1,'reload during the opening animation');
 // A browser that keeps serving the cached page cannot loop: then a fresh address, then only the button.
 {const moved=[];p.w.PELEJA_RELOAD_TO=href=>moved.push(href);p.w.PELEJA_CHECK_RELEASE();await tick(30);assert.equal(p.reloads.length,1);assert.deepEqual(moved,['https://cbgmvinicius.github.io/peleja/next/directions/?r=bbb#painel']);
  p.w.PELEJA_CHECK_RELEASE();await tick(30);assert.equal(moved.length,1);assert.equal(p.reloads.length,1);assert.match(p.banner().textContent,/versão nova/);}
 p.w.close();
 // The opening error screen is not the opening animation.
 p=await page({body:'<section class="peleja-entry entry-error"><p>Erro</p></section>'});assert.equal(p.reloads.length,0);await tick(800);assert.equal(p.reloads.length,1);p.w.close();
 // Same release: nothing happens.
 p=await page({server:'aaa'});await tick(800);assert.equal(p.reloads.length,0);assert.equal(p.banner(),null);p.w.close();
 // Development copy (no stamp or "local"): never checks.
 p=await page({page:''});assert.equal(p.fetches.length,0);p.w.close();
 p=await page({page:'local'});assert.equal(p.fetches.length,0);p.w.close();
 // Server unavailable: stays quiet.
 p=await page({status:500});await tick(800);assert.equal(p.reloads.length,0);assert.equal(p.banner(),null);p.w.close();
 // Something open (dialog, a filled form field): offers a button instead of reloading.
 for(const body of ['<dialog open><p>Respondendo</p></dialog>','<form><input id="pw" value="segredo"></form>']){
  p=await page({body});await tick(800);
  assert.equal(p.reloads.length,0);assert.match(p.banner().textContent,/versão nova/);
  p.banner().querySelector('button').click();assert.equal(p.reloads.length,1);
  p.w.PELEJA_CHECK_RELEASE();await tick(30);assert.equal(p.w.document.querySelectorAll('#pelejaUpdate').length,1,'offered once');p.w.close();
 }
 // Checks again when the tab comes back.
 p=await page({server:'aaa'});Object.defineProperty(p.w.document,'hidden',{value:false,configurable:true});p.w.document.dispatchEvent(new p.w.Event('visibilitychange'));await tick(30);assert.equal(p.fetches.length,2);p.w.close();
 console.log('PASS release check: no-store release.json, auto reload when idle, button when busy, quiet when same/local/offline, recheck on return');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
