import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnifiedCalendar} from '../src/calendar/unified-calendar.ts';
const e=(uid,kind,t,more={})=>({
 uid,kind,siteUid:'site_1',status:'scheduled',
 serverConfirmed:true,scheduledAtUtcMs:t,...more,
});
test('IANA timezone and DST spring-forward display correct local days',()=>{
 const a=Date.parse('2026-03-08T06:30:00Z');
 const b=Date.parse('2026-03-08T07:30:00Z');
 const c=buildUnifiedCalendar([e('a','post',a),e('b','post',b)],'America/New_York');
 assert.equal(c.days.length,1);
 assert.equal(c.days[0].localDate,'2026-03-08');
 assert.equal(c.days[0].entries.length,2);
});
test('same instant may belong to different local calendar days',()=>{
 const ms=Date.parse('2026-10-14T23:00:00Z');
 assert.equal(buildUnifiedCalendar([e('a','post',ms)],'Asia/Ho_Chi_Minh').days[0].localDate,'2026-10-15');
 assert.equal(buildUnifiedCalendar([e('a','post',ms)],'America/Los_Angeles').days[0].localDate,'2026-10-14');
});
test('post-linked email follows accepted server post clock only',()=>{
 const a=Date.parse('2026-10-14T10:00:00Z');
 const b=Date.parse('2026-10-14T12:00:00Z');
 const post=e('p','post',a);
 const email=e('linked','post_linked_email',b,{linkedPostUid:'p'});
 const c=buildUnifiedCalendar([post,email],'UTC');
 assert.equal(c.days[0].entries.length,2);
 assert.deepEqual(c.days[0].entries.map(x=>x.effectiveAtUtcMs),[a,a]);
 assert.equal(c.days[0].overlappingServerTimes.length,1);
});
test('standalone email has its own confirmed clock',()=>{
 const c=buildUnifiedCalendar([e('stand','standalone_email',0)],'UTC');
 assert.equal(c.days[0].entries[0].effectiveAtUtcMs,0);
});
test('offline tentative events are isolated, never counted as confirmed schedule',()=>{
 const c=buildUnifiedCalendar([e('one','post',1000,{serverConfirmed:false})],'UTC');
 assert.equal(c.days.length,0);
 assert.equal(c.blocked[0].blockedReason,'UNCONFIRMED_LOCAL_STATE');
 assert.equal(c.tentativeCount,1);
});
test('future unconfirmed Post blocks linked Email',()=>{
 const c=buildUnifiedCalendar([
  e('post','post',1000,{serverConfirmed:false}),
  e('email','post_linked_email',5000,{linkedPostUid:'post'}),
 ],'UTC');
 assert.equal(c.days.length,0);
 assert.ok(c.blocked.some(x=>x.blockedReason==='LINKED_POST_NOT_CONFIRMED'));
});
test('unscheduled drafts displayed in separate list, not invented time',()=>{
 const c=buildUnifiedCalendar([e('draft','standalone_email',null,{status:'draft'})],'UTC');
 assert.equal(c.unscheduled.length,1);assert.equal(c.days.length,0);
});
test('invalid zones, duplicate identities and status fail closed',()=>{
 assert.throws(()=>buildUnifiedCalendar([],'Nowhere/Invalid'),/timezone/);
 assert.throws(()=>buildUnifiedCalendar([e('p','post',100),e('p','post',200)],'UTC'),/Duplicate/);
 assert.throws(()=>buildUnifiedCalendar([e('p','post',100,{status:'unknown'})],'UTC'),/Invalid/);
});
test('same UID across separate sites is distinct',()=>{
 const c=buildUnifiedCalendar([e('p','post',100),e('p','post',200,{siteUid:'other'})],'UTC');
 assert.equal(c.days[0].entries.length,2);
});
test('advisory time overlaps do not grant sending or schedule permission',()=>{
 const c=buildUnifiedCalendar([e('p','post',100),e('e','standalone_email',100)],'UTC');
 assert.equal(c.days[0].overlappingServerTimes.length,1);
 assert.equal('sendApproved' in c,false);
});
