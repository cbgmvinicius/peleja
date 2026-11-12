// CardioPapers: one new lesson a day, never in an exam week (Monday to Sunday with an exam), past or future,
// and the dates follow the exams when they change.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..','next');
global.window=global;
require(path.join(root,'courses-data.js'));
const src=fs.readFileSync(path.join(root,'directions','extra-courses.js'),'utf8');
const key='const extraDates=new CardioDates();',a=src.indexOf('const scheduledExtra'),b=src.indexOf(key)+key.length;
assert.ok(a>=0&&b>key.length,'schedule code found');
var facultyRecords=[];
const {extraDates,scheduledExtra}=eval(src.slice(a,b)+';({extraDates,scheduledExtra})');
const monday=d=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return x.toISOString().slice(0,10);};
const dates=()=>scheduledExtra.map(l=>extraDates.get(l.id));

// Without exams: one a day from Sep 27, skipping only the approved pause (weeks of Oct 19 and Oct 26).
let d=dates();
assert.equal(d[0],'2026-09-27');
assert.ok(!d.some(x=>monday(x)==='2026-10-19'||monday(x)==='2026-10-26'),'approved pause kept');
assert.equal(new Set(d).size,d.length,'one lesson per day');
assert.ok(d.every((x,i)=>i===0||x>d[i-1]),'in order');

// The real exams: no lesson in any exam week, past (Sep 21, Sep 28) or future (Nov 9, 16, 23).
facultyRecords=['2026-08-24','2026-09-21','2026-09-29','2026-10-01','2026-10-22','2026-10-26','2026-11-12','2026-11-17','2026-11-19','2026-11-23','2026-11-27'].map(date=>({date}));
d=dates();
const examWeeks=new Set(facultyRecords.map(e=>monday(e.date)));
assert.ok(!d.some(x=>examWeeks.has(monday(x))),'no lesson in an exam week');
assert.equal(d[0],'2026-10-05','starts after the exam weeks of Sep 21 and Sep 28');
assert.ok(d.includes('2026-11-08')&&!d.includes('2026-11-09')&&d.includes('2026-11-30'),'pauses Nov 9-29, back on Nov 30');
assert.equal(new Set(d).size,d.length);assert.ok(d.every((x,i)=>i===0||x>d[i-1]));

// A new exam moves the dates on the next read; removing it brings them back.
const before=extraDates.get(scheduledExtra[60].id);
facultyRecords.push({date:'2026-12-10'});
assert.ok(!dates().some(x=>monday(x)==='2026-12-07'),'new exam week skipped');
facultyRecords.pop();assert.equal(extraDates.get(scheduledExtra[60].id),before);
console.log('PASS CardioPapers schedule: one a day, approved pause, no lessons in exam weeks (past and future), follows exam changes');
