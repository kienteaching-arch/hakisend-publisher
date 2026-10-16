import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCalendarReadRequest,validateHakiSendCalendar} from '../src/calendar/server-calendar-contract.ts';

const site='11111111-1111-4111-8111-111111111111';
const otherSite='22222222-2222-4222-8222-222222222222';
const postUid='33333333-3333-4333-8333-333333333333';
const post={
  uid:postUid,kind:'post',siteUid:site,title:'Scheduled Post',
  status:'scheduled',serverConfirmed:true,
  scheduledAtUtcMs:Date.parse('2026-10-15T08:00:00Z'),
  postPublishAtUtcMs:Date.parse('2026-10-15T08:00:00Z'),
  postUnpublishAtUtcMs:null,publicVisibility:'not_attested',
  sendAuthorized:false,
};
const standalone={
  uid:'88888888-8888-4888-8888-888888888888',
  kind:'standalone_email',siteUid:site,title:'Standalone Draft',
  status:'draft',serverConfirmed:true,scheduledAtUtcMs:null,
  sendAuthorized:false,
};
const linked={
  uid:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  kind:'post_linked_email',siteUid:site,title:'Not enrolled email',
  status:'draft',serverConfirmed:true,scheduledAtUtcMs:null,
  linkedPostUid:postUid,sendAuthorized:false,
  scheduleAuthorization:'not_attested',
};
const envelope=()=>({
  success:true,data:{
    contract_version:'hks_calendar_v1',site_uid:site,
    as_of_utc_ms:Date.parse('2026-10-14T00:00:00Z'),
    truncated:false,read_only:true,
    events:[{...post},{...standalone},{...linked}],
  },
});
const check=(p=envelope())=>validateHakiSendCalendar(p,site,'Asia/Ho_Chi_Minh');

test('accept exact versioned real backend field shape and localize without sending',()=>{
  const validated=check();
  assert.equal(validated.contractVersion,'hks_calendar_v1');
  assert.equal(validated.calendar.days.length,1);
  assert.equal(validated.calendar.days[0].localDate,'2026-10-15');
  assert.equal(validated.calendar.unscheduled.length,1);
  assert.equal(validated.calendar.blocked.length,1);
  assert.equal(validated.calendar.blocked[0].blockedReason,'LINKED_EMAIL_NOT_ENROLLED');
  assert.equal(validated.calendar.days[0].entries[0].sendAuthorized,false);
});
test('reject unknown contract versions and wrong Site identity',()=>{
  const x=envelope();x.data.contract_version='hks_calendar_v2';
  assert.throws(()=>check(x),/contract version/);
  const y=envelope();y.data.site_uid=otherSite;
  assert.throws(()=>check(y),/owner-scoped/);
  const z=envelope();z.data.events[0].siteUid=otherSite;
  assert.throws(()=>check(z),/identity/);
});
test('reject server claims that imply sending is authorized',()=>{
  const x=envelope();x.data.events[2].sendAuthorized=true;
  assert.throws(()=>check(x),/authorization/);
  const y=envelope();y.data.read_only=false;
  assert.throws(()=>check(y),/owner-scoped/);
});
test('reject private content fields, even if backend mistakenly included them',()=>{
  for(const key of ['body_markdown','content','html','customer_id','subscribers','recipients']){
    const x=envelope();x.data.events[1][key]='SECRET';
    assert.throws(()=>check(x),/Unexpected calendar content field/);
  }
});
test('reject standalone Draft with invented schedule',()=>{
  const x=envelope();x.data.events[1].scheduledAtUtcMs=Date.parse('2026-10-15T10:00:00Z');
  assert.throws(()=>check(x),/masquerade/);
});
test('reject unapproved linked Email draft with an independent clock',()=>{
  const x=envelope();x.data.events[2].scheduledAtUtcMs=Date.parse('2026-10-15T10:00:00Z');
  assert.throws(()=>check(x),/own schedule/);
});
test('never accept authoring Post as attested live publication',()=>{
  const x=envelope();x.data.events[0].publicVisibility='verified_live';
  assert.throws(()=>check(x),/public visibility/);
});
test('reject missing linkage, fractional or negative timestamps',()=>{
  const x=envelope();delete x.data.events[2].linkedPostUid;
  assert.throws(()=>check(x),/Post linkage/);
  const y=envelope();y.data.events[0].scheduledAtUtcMs=1.5;
  assert.throws(()=>check(y),/time or authorization/);
  const z=envelope();z.data.as_of_utc_ms=-1;
  assert.throws(()=>check(z),/owner-scoped/);
});
test('reject duplicate events through shared Calendar projection',()=>{
  const x=envelope();x.data.events.push({...post});
  assert.throws(()=>check(x),/Duplicate calendar event/);
});
test('current server Calendar never attests outgoing Email sent or scheduled',()=>{
  for (const kind of ['standalone_email','post_linked_email']) {
    for(const status of ['scheduled','sent','published','planned','failed']) {
      const x=envelope();
      const index=kind==='standalone_email'?1:2;
      x.data.events[index].status=status;
      assert.throws(()=>check(x),/identity, time or authorization/);
    }
  }
  const x=envelope();x.data.events[1].status='cancelled';
  assert.equal(check(x).calendar.unscheduled.length,1);
});
test('authoring Post clock and public state cannot forge arbitrary publication',()=>{
  const x=envelope();x.data.events[0].status='scheduled';
  x.data.events[0].scheduledAtUtcMs+=60000;
  assert.throws(()=>check(x),/unverified clock/);
  const y=envelope();y.data.events[0].status='published';
  assert.throws(()=>check(y),/unverified clock/);
  const z=envelope();z.data.events[0].status='sent';
  assert.throws(()=>check(z),/identity, time or authorization/);
});
test('unexpected top-level or snapshot data is refused, including PII',()=>{
  const x=envelope();x.data.owner_email='private@example.test';
  assert.throws(()=>check(x),/snapshot field/);
  const y=envelope();y.recipients=['private@example.test'];
  assert.throws(()=>check(y),/envelope field/);
});
test('cross-kind extra fields cannot smuggle an invented schedule or authority',()=>{
  const cases=[
    [0,{scheduleAuthorization:'verified'}],
    [1,{linkedPostUid:postUid}],
    [1,{publicVisibility:'verified_live'}],
    [2,{postPublishAtUtcMs:Date.now()}],
    [2,{scheduleAuthorization:'ready'}],
    [2,{publicVisibility:'verified_live'}],
  ];
  for(const [index,extra] of cases){
    const x=envelope();Object.assign(x.data.events[index],extra);
    assert.throws(()=>check(x),/schedule|visibility|clock|masquerade/i);
  }
});
test('bounded HTTPS request includes OAuth only in Authorization header',()=>{
  const token='hks_pub_synthetic_for_tests_only';
  const q=buildCalendarReadRequest('https://hakisend.example/',site,token,25);
  assert.equal(q.method,'GET');
  assert.equal(q.url,'https://hakisend.example/api/v1/hakisend/sites/'+site+'/calendar?limit=25');
  assert.equal(q.headers.Authorization,'Bearer '+token);
  assert.ok(!q.url.includes(token));
});
test('reject insecure or credentialed Calendar request origins and malformed tokens',()=>{
  for(const u of ['http://hakisend.example/','https://user:pass@hakisend.example/','https://hakisend.example/?token=x','https://hakisend.example/internal']){
    assert.throws(()=>buildCalendarReadRequest(u,site,'hks_pub_synthetic'),/plain HTTPS origin/);
  }
  assert.throws(()=>buildCalendarReadRequest('https://hakisend.example/',site,'bad\nvalue'),/bearer/);
  assert.throws(()=>buildCalendarReadRequest('https://hakisend.example/',site,'hks_pub_synthetic',1001),/page size/);
});
