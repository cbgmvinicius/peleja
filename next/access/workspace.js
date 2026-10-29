/* Read-only bridge. Catalog owns structure; personal payload owns progress/results. */
(function(root){
'use strict';
function combineWorkspace(remote){
 const personal=structuredClone(remote.payload||{}), result=structuredClone(personal);
 for(const key of ['materials','exams','simulations','courses','questionSessions']){
  if(result[key]==null)result[key]=[];
  if(!Array.isArray(result[key]))throw Error('Lista inválida: '+key);
 }
 if(remote.catalog_revision>0){
  const catalog=remote.catalog;
  for(const key of ['materials','exams']){
   if(!Array.isArray(catalog?.[key]))throw Error('Catálogo inválido: '+key);
   const old=new Map(result[key].map(item=>[item.id,item]));
   result[key]=catalog[key].map(item=>{
    const previous=old.get(item.id)||{}, merged={...previous,...item};
    const privateKeys=key==='materials'?['read','made','questionEntries','questions','correct','wrong','notes']:['performed','performedOverride','grade','total','correct','wrong'];
    for(const field of privateKeys){delete merged[field];if(Object.hasOwn(previous,field))merged[field]=previous[field];}
    return merged;
   });
  }
 }
 return result;
}
function examDone(e,day){
 return !!(e.total!=null||e.grade!=null||(e.date&&e.date<day));
}
if(typeof module!=='undefined')module.exports={combineWorkspace,examDone};
else root.PELEJA_READ_WORKSPACE={combineWorkspace,examDone};
})(globalThis);
