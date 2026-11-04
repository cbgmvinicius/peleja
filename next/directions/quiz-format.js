/* "peleja-quiz" v1, the file produced by the extension "Peleja — Extrair questões".
   Same rules as the extension's quiz.js (normalize only); the server checks them again. */
(function(root){
 'use strict';
 const MAX=8*1024*1024;
 function normalize(raw,meta={}){
  const list=raw&&(raw.quiz||raw.questions);
  if(!Array.isArray(list)||!list.length||list.length>1000)throw Error('Quantidade de questões inválida.');
  const questions=list.map((q,i)=>{
   const options=q&&(q.answerOptions||q.options);
   if(typeof q?.question!=='string'||!q.question.trim()||q.question.length>50000||!Array.isArray(options)||options.length<2||options.length>20)throw Error(`Questão ${i+1} inválida.`);
   const answerOptions=options.map(a=>{
    if(typeof a?.text!=='string'||!a.text.trim()||a.text.length>30000||typeof a.rationale!=='string'||!a.rationale.trim()||a.rationale.length>50000||typeof a.isCorrect!=='boolean')throw Error(`Questão ${i+1}: alternativa ou comentário incompleto.`);
    return {text:a.text,isCorrect:a.isCorrect,rationale:a.rationale};
   });
   if(answerOptions.filter(a=>a.isCorrect).length!==1)throw Error(`Questão ${i+1}: gabarito ambíguo.`);
   return {question:q.question,answerOptions,hint:typeof q.hint==='string'?q.hint.slice(0,30000):'',topic:typeof q.topic==='string'?q.topic.slice(0,1000):''};
  });
  let source='';try{const u=new URL(meta.source||raw.source||'');if(['notebook.google.com','notebooklm.google.com'].includes(u.hostname)){u.search='';u.hash='';source=u.href;}}catch{}
  const value={format:'peleja-quiz',version:1,title:String(meta.title||raw.title||'Questões do NotebookLM').slice(0,200),source,questions};
  if(JSON.stringify(value).length>MAX)throw Error('Quiz muito grande.');
  return value;
 }
 root.PelejaQuiz={normalize,MAX};
})(globalThis);
