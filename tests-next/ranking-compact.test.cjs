const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const rows=(n,me,tag)=>Array.from({length:n},(_,i)=>`<${tag}${i===me?' class="is-me"':''}><td>${i+1}º</td></${tag}>`).join('');
const dom=new JSDOM(`<div class="app"><main><div id="dashboardRanking"><ol class="dashboard-ranking">${rows(10,6,'li')}</ol></div><div id="rankingContent"><div class="ranking-table-wrap"><table class="ranking-table"><tbody>${rows(4,3,'tr')}</tbody></table></div></div></main></div>`,{runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.eval(fs.readFileSync(path.join(__dirname,'../next/directions/ranking-compact.js'),'utf8'));w.PELEJA_COMPACT_RANKINGS();
const ol=w.document.querySelector('.dashboard-ranking'),visible=()=>[...ol.children].filter(li=>!li.classList.contains('rank-hidden')).map(li=>li.classList.contains('rank-gap')?'⋯':li.textContent);
assert.deepEqual(visible(),['1º','2º','3º','⋯','6º','7º','8º','⋯'],'top 3, the one above, you, the one below');
const more=w.document.querySelector('#dashboardRanking .rank-more');assert.equal(more.textContent,'Ver todos (10)');
more.click();assert.equal(visible().length,10);assert.equal(w.document.querySelector('#dashboardRanking .rank-more').textContent,'Mostrar menos');
w.document.querySelector('#dashboardRanking .rank-more').click();assert.equal(visible().length,8);
assert.equal(w.document.querySelector('#rankingContent .rank-more'),null,'short lists stay as they are');
// A list drawn again (new period, new data) is compacted again.
w.document.getElementById('dashboardRanking').innerHTML=`<ol class="dashboard-ranking">${rows(9,0,'li')}</ol>`;
setTimeout(()=>{const list=w.document.querySelector('.dashboard-ranking');assert.equal(list.dataset.compacted,'1');assert.equal([...list.children].filter(li=>!li.classList.contains('rank-hidden')&&!li.classList.contains('rank-gap')).length,3);
 console.log('PASS compact rankings: top 3 + neighbours with gaps, Ver todos / Mostrar menos, short lists untouched, redraws compacted again');w.close();},100);
