// Inline LaTeX in question text ($\Delta$, $10^{6}$, $\frac{a}{b}$) shown as plain text, money left alone.
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const dom=new JSDOM('<!doctype html><body><p id="q"></p><textarea id="t">$\\Delta$</textarea></body>',{runScripts:'outside-only'}),w=dom.window;
w.eval(fs.readFileSync(path.join(__dirname,'../next/directions/math-text.js'),'utf8'));
const M=w.PELEJA_MATH,tick=()=>new Promise(r=>setTimeout(r,0));
const show=async text=>{const p=w.document.getElementById('q');p.textContent=text;await tick();return p;};

(async()=>{
 let p=await show('objetivando-se um incremento de 100 pontos ($\\Delta$ atividade = 100%). Qual a dose?');
 assert.equal(p.textContent,'objetivando-se um incremento de 100 pontos (Δ atividade = 100%). Qual a dose?');
 assert.ok(p.querySelector('span.math'));
 p=await show('Plaquetas < $150 \\times 10^{3}/\\mu L$ e $K^+$ baixo, $CO_2$ alto');
 assert.equal(p.textContent,'Plaquetas < 150 × 103/μL e K+ baixo, CO2 alto');
 assert.equal(p.querySelectorAll('sup').length,2);assert.equal(p.querySelector('sub').textContent,'2');
 p=await show('Dose: $\\frac{10 \\times 100}{2}$ UI, se $FC \\geq 100$ e $T \\leq 37^\\circ C$ ou $\\sqrt{x}$');
 assert.equal(p.textContent,'Dose: (10 × 100)/2 UI, se FC ≥ 100 e T ≤ 37° C ou √x');
 p=await show('$\\text{Dose} = \\text{peso} \\cdot 0{,}5$ e $\\alpha$, $\\beta$-bloqueador');
 assert.equal(p.textContent,'Dose = peso · 0,5 e α, β-bloqueador');
 // Money and plain dollars stay as they are; text in fields is never touched.
 p=await show('Custou R$ 10 e depois R$ 20, total R$ 30.');assert.equal(p.textContent,'Custou R$ 10 e depois R$ 20, total R$ 30.');assert.equal(p.querySelector('.math'),null);
 assert.equal(w.document.getElementById('t').value,'$\\Delta$');
 // Built with nodes, never HTML: markup inside a formula stays text.
 p=await show('$\\Delta <img src=x onerror=alert(1)>$');assert.equal(p.querySelector('img'),null);assert.match(p.textContent,/Δ<img/);
 assert.equal(M.plain('\\Delta x'),'Δx');
 console.log('PASS math text: Greek, symbols, sup/sub, frac, sqrt, text wrappers, money untouched, fields untouched, no HTML injection');
})().catch(e=>{console.error(e);process.exit(1);});
