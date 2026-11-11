// Inline formulas in question text: Gemini / NotebookLM write LaTeX between dollar signs ("$\Delta$ atividade",
// "$10^{6}$", "$\geq 2$"). Shown as plain text with Greek letters, symbols, superscripts and subscripts; no library.
// A dollar right after a letter is money (R$, US$), and "$ 10 e $" with spaces at the edges is not math, so
// "R$ 10 e R$ 20" stays as it is; "$3$", "$HbSS$" and "$r = -0{,}14$" lose their dollars.
(function(root){
 'use strict';
 const SYMBOLS={
  alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',varepsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',pi:'π',rho:'ρ',sigma:'σ',tau:'τ',phi:'φ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',
  Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',Sigma:'Σ',Phi:'Φ',Psi:'Ψ',Omega:'Ω',
  times:'×',cdot:'·',div:'÷',pm:'±',mp:'∓',geq:'≥',ge:'≥',leq:'≤',le:'≤',neq:'≠',ne:'≠',approx:'≈',sim:'~',equiv:'≡',propto:'∝',
  to:'→',rightarrow:'→',Rightarrow:'⇒',leftarrow:'←',leftrightarrow:'↔',uparrow:'↑',downarrow:'↓',infty:'∞',degree:'°',circ:'°',
  partial:'∂',sum:'Σ',prod:'Π',int:'∫',sqrt:'√',ldots:'…',dots:'…',cdots:'⋯',prime:'′',angle:'∠',
  '%':'%',$:'$','{':'{','}':'}','&':'&','#':'#',_:'_',',':' ',';':' ',':':' ','!':'',quad:' ',qquad:'  ',' ':' '
 };
 // Accents over a letter: d\acute{e}j\grave{a} → déjà.
 const ACCENTS={acute:'\u0301',grave:'\u0300',tilde:'\u0303',hat:'\u0302',bar:'\u0304',ddot:'\u0308',"'":'\u0301','`':'\u0300','~':'\u0303','^':'\u0302','"':'\u0308'};
 const WRAPPERS=new Set(['text','mathrm','mathbf','mathit','textbf','textit','operatorname','mathsf','boldsymbol','bm','left','right','displaystyle']);
 // A segment between single dollars that looks like math.
 const SEGMENT=/\$([^$\n]{1,200}?)\$/g;
 const looksMath=s=>/[\\^_]/.test(s)||s===s.trim();
 // Some imports lost one backslash in JSON: "\text" arrived as a tab + "ext", "\frac" as a form feed + "rac".
 const CONTROL={'\t':'t','\f':'f','\b':'b','\r':'r','\v':'v'};
 const repair=s=>s.replace(/[\t\f\b\r\v](?=[a-zA-Z])/g,c=>'\\'+CONTROL[c]);

 // Reads one argument after a command or ^/_: {...} or a single character.
 function arg(src,i){
  while(src[i]===' ')i++;
  if(src[i]==='{'){let depth=1,j=i+1;for(;j<src.length&&depth;j++){if(src[j]==='{')depth++;else if(src[j]==='}')depth--;}return [src.slice(i+1,j-1),j];}
  if(src[i]==='\\'){const m=/^\\([a-zA-Z]+|.)/.exec(src.slice(i));return m?[m[0],i+m[0].length]:['',i];}
  return [src[i]??'',i+1];
 }
 // LaTeX source → list of parts: strings, {sup:[...]} and {sub:[...]}.
 function parse(src){
  const out=[];let text='',i=0;
  const flush=()=>{if(text){out.push(text);text='';}};
  while(i<src.length){
   const c=src[i];
   if(c==='\\'){
    const m=/^\\([a-zA-Z]+|.)/.exec(src.slice(i));const name=m?m[1]:'';i+=m?m[0].length:1;
    if(name==='frac'||name==='dfrac'||name==='tfrac'){const [a,j]=arg(src,i);const [b,k]=arg(src,j);i=k;flush();const wrap=s=>s.length>1&&/[+\-×·\s]/.test(plain(s))?['(',...parse(s),')']:parse(s);out.push(...wrap(a),'/',...wrap(b));continue;}
    if(name==='sqrt'){const [a,j]=arg(src,i);i=j;flush();out.push('√',...(a.length>1?['(',...parse(a),')']:parse(a)));continue;}
    if(Object.hasOwn(ACCENTS,name)){const [a,j]=arg(src,i);i=j;text+=(plain(a)+ACCENTS[name]).normalize('NFC');continue;}
    if(WRAPPERS.has(name)){if(src[i]==='{'){const [a,j]=arg(src,i);i=j;flush();out.push(...parse(a));}continue;}
    const sym=Object.hasOwn(SYMBOLS,name)?SYMBOLS[name]:name;text+=sym;
    // \mu L reads as μL; operators keep their spaces (150 \times 10 → 150 × 10)
    if(/^[a-zA-Z]+$/.test(name)&&/^\p{L}+$/u.test(sym)&&src[i]===' '&&src[i+1]!==String.fromCharCode(92))i++; // but "\Delta \text{x}" keeps the space: Δ x
    continue;
   }
   if(c==='^'||c==='_'){const [a,j]=arg(src,i+1);i=j;flush();if(a==='\\circ'){out.push('°');continue;}out.push(c==='^'?{sup:parse(a)}:{sub:parse(a)});continue;}
   if(c==='{'||c==='}'){i++;continue;}
   text+=c;i++;
  }
  flush();return out;
 }
 const plain=src=>parse(src).map(p=>typeof p==='string'?p:'').join('');
 function build(doc,parts,into){
  for(const p of parts){
   if(typeof p==='string')into.append(doc.createTextNode(p));
   else{const tag=p.sup?'sup':'sub',n=doc.createElement(tag);build(doc,p.sup||p.sub,n);into.append(n);}
  }
 }
 // Text → nodes; null when there is nothing to convert.
 function nodes(doc,text){
  if(typeof text!=='string'||!text.includes('$'))return null;
  SEGMENT.lastIndex=0;let m,last=0,found=false;const frag=doc.createDocumentFragment();
  while((m=SEGMENT.exec(text))){
   // money (R$, US$) or not math: try again from the next dollar
   if((m.index>0&&/\p{L}/u.test(text[m.index-1]))||!looksMath(m[1])){SEGMENT.lastIndex=m.index+1;continue;}
   found=true;if(m.index>last)frag.append(doc.createTextNode(text.slice(last,m.index)));
   const span=doc.createElement('span');span.className='math';build(doc,parse(repair(m[1]).trim()),span);frag.append(span);last=m.index+m[0].length;
  }
  if(!found)return null;
  if(last<text.length)frag.append(doc.createTextNode(text.slice(last)));
  return frag;
 }
 const SKIP=new Set(['TEXTAREA','INPUT','SCRIPT','STYLE','CODE','PRE','OPTION','TITLE']);
 function convertText(node){
  const parent=node.parentElement;if(!parent||SKIP.has(parent.tagName)||parent.isContentEditable||parent.closest('.math'))return;
  const frag=nodes(node.ownerDocument,node.nodeValue);if(frag)node.replaceWith(frag);
 }
 // Converts every text node under an element (already shown or just added).
 function render(el){
  if(!el)return;
  if(el.nodeType===3){convertText(el);return;}
  if(el.nodeType!==1&&el.nodeType!==11)return;
  const doc=el.ownerDocument||el,walker=doc.createTreeWalker(el,4),list=[];
  while(walker.nextNode())if(walker.currentNode.nodeValue.includes('$'))list.push(walker.currentNode);
  list.forEach(convertText);
 }
 root.PELEJA_MATH={parse,plain,nodes,render};
 // Questions are drawn by several screens (solver, import, review); one observer covers all of them.
 const doc=root.document;
 if(doc?.body&&typeof root.MutationObserver==='function'){
  render(doc.body);
  new root.MutationObserver(records=>{for(const r of records){if(r.type==='characterData')convertText(r.target);else r.addedNodes.forEach(render);}})
   .observe(doc.body,{childList:true,subtree:true,characterData:true});
 }
})(globalThis);
