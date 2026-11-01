globalThis.PELEJA_INSTALL_COURSES=({writer,allowed,saveChange,client,getUser})=>{
 let lastRemote=null;
 const ids={};function indexCourses(){for(const key of Object.keys(ids))delete ids[key];for(const [key,c] of Object.entries(extraCatalog)){ids[key]=new Set(c.modules.flatMap(m=>m.lessons.map(l=>l.id)));extraWatched[key]??=new Set();}}
 function restoreChecks(){indexCourses();for(const key of Object.keys(ids)){extraWatched[key].clear();for(const row of lastRemote?.payload?.courses||[])if(ids[key].has(row.id))extraWatched[key].add(row.id);}}
 const catalog=PELEJA_INSTALL_COURSE_CATALOG({client,allowed,getUser,writer,saveChange,onCatalog:restoreChecks});indexCourses();
 const originalClick=$('extraPage').onclick;
 $('extraPage').onclick=event=>{
  const button=event.target.closest('[data-extra-check]');
  if(!button){originalClick(event);return;}
  const course=extraActive,id=button.dataset.extraCheck;
  if(writer.busy||writer.blocked||!extraAllowed(course)||!ids[course]?.has(id))return;
  const before=extraWatched[course].has(id);
  originalClick(event);
  saveChange({kind:'course',id,watched:!before},()=>{lastRemote=writer.snapshot;},null,()=>{
   before?extraWatched[course].add(id):extraWatched[course].delete(id);
   clearStudyEffects(button);
   if(!$('extraPage').hidden){if(extraActive===course)renderExtraModules();else if(!extraActive)renderExtraLanding();}
  });
 };
 return {
  load:()=>catalog.load(),
  reset(){catalog.reset();lastRemote=null;for(const watched of Object.values(extraWatched))watched.clear();extraActive=null;extraExpanded.clear();$('extraPage').replaceChildren();},
  hydrate(remote){
   lastRemote=remote;catalog.hydrate(remote);restoreChecks();
   if(!$('extraPage').hidden){if(extraActive)renderExtraModules();else renderExtraLanding();}
  }
 };
};
