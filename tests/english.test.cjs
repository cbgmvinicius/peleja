const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const w=new JSDOM(read('index.html'),{url:'https://peleja.test',runScripts:'outside-only',pretendToBeVisual:true}).window,d=w.document;
try{
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.eval(read('storage.js'));w.PELEJA_STORAGE.activateUser('owner');w.PELEJA_ACCESS={isAdmin:true};
 for(const file of ['courses-data.js','english-data.js','english.js','courses.js'])w.eval(read(file));
 const data=w.PELEJA_ENGLISH;assert.equal(data.lessons.length,331);assert.equal(new Set(data.lessons.map(l=>l.id)).size,331);
 for(const view of Object.values(data.views)){const ids=view.flatMap(s=>s.modules.flatMap(m=>m.lessons));assert.equal(ids.length,331);assert.equal(new Set(ids).size,331);}
 assert(!read('english-data.js').includes('checked'));assert(!read('english-data.js').includes('DEFAULT_CHECKED'));
 w.PELEJA_STORAGE.setItem('medstudy_courses_v1',JSON.stringify([{id:'ecg-m06-01'},{id:'cimv-f001'}]));w.PELEJA_STORAGE.setItem('peleja_preferences_v1',JSON.stringify({englishCurrent:'cimv-f208'}));
 d.getElementById('enterEnglish').click();assert.equal(d.querySelectorAll('[data-english-lesson]').length,331);assert(d.querySelector('[data-english-lesson="cimv-f001"]').checked);assert.match(d.getElementById('englishResume').textContent,/F208/);
 d.getElementById('englishResume').click();let input=d.querySelector('[data-english-lesson="cimv-f208"]');assert(input.closest('details').open);input.click();assert.equal(w.PELEJA_STORAGE.snapshot().payload.courses.length,3);assert(w.PELEJA_STORAGE.snapshot().payload.courses.some(r=>r.id==='ecg-m06-01'));
 const next=w.PELEJA_STORAGE.snapshot().payload.preferences.englishCurrent;assert.notEqual(next,'cimv-f208');
 d.getElementById('englishView').value='classic';d.getElementById('englishView').dispatchEvent(new w.Event('change'));assert(d.querySelector('[data-english-lesson="cimv-f208"]').checked);
 d.querySelector('[data-english-lesson="cimv-f208"]').click();assert.equal(w.PELEJA_STORAGE.snapshot().payload.courses.length,2);
 d.getElementById('englishSearch').value='#F208';d.getElementById('englishSearch').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('[data-english-lesson]').length,1);
 d.getElementById('backToCourses').click();assert(d.getElementById('enterEnglish'));
 w.PELEJA_STORAGE.activateUser('other');w.PELEJA_ACCESS={isAdmin:false};w.dispatchEvent(new w.Event('peleja:access-changed'));assert(!d.getElementById('enterEnglish'));assert.equal(w.PELEJA_STORAGE.snapshot().payload.courses.length,0);
 console.log('PASS English: 331 unique lessons in both views, private progress, shared IDs, preserved CardioPapers, resume, search, uncheck, navigation and account isolation');
}finally{w.close();}
