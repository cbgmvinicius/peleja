const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../focus.js'),'utf8');
const context={};vm.runInNewContext(source.split('/* Server-timestamped')[0],context);
const phase=context.PELEJA_FOCUS_PHASE,session={planned_minutes:25,cycles_enabled:true};
const at=m=>phase(session,m*60000);
assert.equal(at(0).remaining,25*60000);
assert.equal(at(25).kind,'break');assert.equal(at(25).remaining,5*60000);
assert.equal(at(30).kind,'focus');assert.equal(at(30).cycle,2);
assert.equal(at(115).kind,'long');assert.equal(at(115).remaining,15*60000);
assert.equal(at(130).kind,'focus');assert.equal(at(130).cycle,5);
assert.equal(at(130).focusMs,100*60000);
assert.equal(at(115.5).focusMs,100*60000);
assert.equal(at(130*100+25).cycle,401);assert.equal(at(130*100+25).kind,'break');
// Pausing freezes the same active elapsed value; reconnect derives phase without replaying transitions.
assert.deepEqual(at(67),at(67));assert.equal(at(67).cycle,3);
assert.equal(phase({planned_minutes:25},9000000).kind,'free');
assert.equal(phase({planned_minutes:0,cycles_enabled:true},9000000).focusMs,9000000);
assert.equal(at(-1).remaining,1500000);
console.log('PASS automatic cycles: boundaries, long breaks, offline catch-up, focus-only history, legacy/free timers');
