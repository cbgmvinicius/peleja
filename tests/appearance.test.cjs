const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const w=new JSDOM(read('index.html'),{url:'https://peleja.test',runScripts:'outside-only',pretendToBeVisual:true}).window,d=w.document;
try{
 w.eval(read('storage.js'));w.PELEJA_STORAGE.activateUser('a');w.PELEJA_ACCESS={accessAllowed:true,signedIn:true};w.eval(read('appearance.js'));
 assert(d.getElementById('tutorialModal').classList.contains('open'));d.getElementById('closeTutorial').click();assert(w.PELEJA_STORAGE.snapshot().payload.preferences.tutorialSeen);
 d.getElementById('appearanceTheme').value='dark';d.getElementById('appearanceTheme').dispatchEvent(new w.Event('change'));assert.equal(d.documentElement.dataset.theme,'dark');
 d.getElementById('appearanceLayout').value='top';d.getElementById('appearanceLayout').dispatchEvent(new w.Event('change'));assert.equal(d.body.dataset.layout,'top');
 const payload=w.PELEJA_STORAGE.snapshot().payload;w.PELEJA_STORAGE.replaceRemote(payload,1,0);assert(!d.getElementById('tutorialModal').classList.contains('open'));
 w.PELEJA_STORAGE.activateUser('b');assert.equal(d.documentElement.dataset.theme,'light');assert(d.getElementById('tutorialModal').classList.contains('open'));
 d.getElementById('closeTutorial').click();d.getElementById('profileTutorial').click();assert(d.getElementById('tutorialModal').classList.contains('open'));
 assert(d.querySelector('.header-actions #refreshStudyProgress'));assert(d.querySelector('.header-actions #profileMenu'));assert(d.getElementById('rankingSyncButton').getAttribute('aria-label'));assert(d.getElementById('openRankGuide').getAttribute('aria-label'));
 console.log('PASS Appearance: per-account theme/layout, tutorial once and reopen, account isolation and accessible header controls');
}finally{w.close();}
