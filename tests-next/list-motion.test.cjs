const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'../next/directions/app.js'),'utf8');
const dom=new JSDOM('<div id="app"><div id="library"><section class="group"></section></div><div id="empty" hidden></div></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
w.$=id=>w.document.getElementById(id);w.app=w.$('app');w.reduceMotion=()=>false;w.render=()=>{};w.renderContent=()=>{};w.innerHeight=800;w.motion=()=>({cancel(){}});w.HTMLElement.prototype.animate=()=>({});
let clones=0;for(let i=0;i<100;i++){const row=w.document.createElement('article');row.dataset.row=String(i);row.getBoundingClientRect=()=>({top:i*200,bottom:i*200+100,left:0,width:500,height:100});const clone=row.cloneNode.bind(row);row.cloneNode=(...args)=>{clones++;return clone(...args)};w.document.querySelector('.group').append(row);}
w.eval(source.slice(source.indexOf('let libraryFilterEffects='),source.indexOf('const studyEffects='))+'\nrenderLibrarySwitch();');
assert.equal(clones,5,'only the visible rows and small overscan are cloned');
assert.equal(w.document.querySelectorAll('[data-row]').length,100,'offscreen rows remain in the list');
console.log('PASS list animation bounds transient copies to viewport without dropping offscreen subjects');w.close();
