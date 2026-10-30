globalThis.PELEJA_INSTALL_COURSES=({writer,allowed,saveChange})=>{
 const ids={cardio:new Set(extraCatalog.cardio.modules.flatMap(m=>m.lessons.map(l=>l.id))),english:new Set(PELEJA_ENGLISH.lessons.map(l=>l.id))};
 extraAllowed=key=>key==='cardio'||(key==='english'&&allowed());
 const originalClick=$('extraPage').onclick;
 $('extraPage').onclick=event=>{
  const button=event.target.closest('[data-extra-check]');
  if(!button){originalClick(event);return;}
  const course=extraActive,id=button.dataset.extraCheck;
  if(writer.busy||writer.blocked||!extraAllowed(course)||!ids[course]?.has(id))return;
  const before=extraWatched[course].has(id);
  originalClick(event);
  saveChange({kind:'course',id,watched:!before},()=>{},null,()=>{
   before?extraWatched[course].add(id):extraWatched[course].delete(id);
   clearStudyEffects(button);
   if(!$('extraPage').hidden){if(extraActive===course)renderExtraModules();else if(!extraActive)renderExtraLanding();}
  });
 };
 return {
  reset(){extraWatched.cardio.clear();extraWatched.english.clear();extraActive=null;extraExpanded.clear();$('extraPage').replaceChildren();},
  hydrate(remote){
   const records=remote.payload?.courses||[];
   for(const key of ['cardio','english']){extraWatched[key].clear();for(const row of records)if(ids[key].has(row.id))extraWatched[key].add(row.id);}
   if(!$('extraPage').hidden){if(extraActive)renderExtraModules();else renderExtraLanding();}
  }
 };
};
