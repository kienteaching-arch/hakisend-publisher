import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptCalendarPage,buildCalendarPageRequest} from '../src/calendar/paged-calendar-contract.ts';

const site='11111111-1111-4111-8111-111111111111';
const foreign='22222222-2222-4222-8222-222222222222';
const cursor1='c1.'+'a'.repeat(64);
const cursor2='c2.'+'b'.repeat(64);
const asOf=Date.parse('2026-10-15T12:00:00Z');
const post={
  uid:'33333333-3333-4333-8333-333333333333',
  kind:'post',siteUid:site,title:'A Site Post',status:'draft',
  serverConfirmed:true,sendAuthorized:false,
  scheduledAtUtcMs:null,postPublishAtUtcMs:null,
  postUnpublishAtUtcMs:null,publicVisibility:'not_attested',
};
const draft={
  uid:'44444444-4444-4444-8444-444444444444',
  kind:'standalone_email',siteUid:site,title:'Private Draft',status:'draft',
  serverConfirmed:true,sendAuthorized:false,scheduledAtUtcMs:null,
};
const linked={
  uid:'55555555-5555-4555-8555-555555555555',
  kind:'post_linked_email',siteUid:site,title:'Never sent',
  status:'draft',serverConfirmed:true,sendAuthorized:false,
  scheduledAtUtcMs:null,linkedPostUid:post.uid,
  scheduleAuthorization:'not_attested',
};
const envelope=(events,nextCursor,siteUid=site)=>({
  success:true,data:{
    contract_version:'hks_calendar_v2',site_uid:siteUid,
    as_of_utc_ms:asOf,read_only:true,
    truncated:nextCursor!==null,next_cursor:nextCursor,
    events,
  }
});
const load=(response,prior=null)=>acceptCalendarPage(response,site,'Asia/Ho_Chi_Minh',prior);

test('manually assemble multiple owner-scoped pages with stable clock and no duplicate events',()=>{
  const p1=load(envelope([post],cursor1));
  assert.equal(p1.pages.length,1);
  assert.equal(p1.nextCursor,cursor1);
  const p2=load(envelope([draft],cursor2),p1);
  assert.equal(p2.pages.length,2);
  assert.equal(p2.seenIdentities.length,2);
  const p3=load(envelope([linked],null),p2);
  assert.equal(p3.pages.length,3);
  assert.equal(p3.nextCursor,null);
  assert.equal(p3.asOfUtcMs,asOf);
  assert.equal(p3.pages[2].calendar.blocked[0].blockedReason,'LINKED_EMAIL_NOT_ENROLLED');
  assert.throws(()=>load(envelope([post],cursor1),p3),/not explicitly available/);
});
test('cross-tenant or changed snapshot clock invalidates subsequent page',()=>{
  const p1=load(envelope([post],cursor1));
  assert.throws(()=>load(envelope([{...draft,siteUid:foreign}],null),p1),/identity/);
  assert.throws(()=>load(envelope([draft],null,foreign),p1),/owner-scoped/);
  const wrong=envelope([draft],null);wrong.data.as_of_utc_ms+=1000;
  assert.throws(()=>load(wrong,p1),/snapshot clock/);
});
test('duplicate event across pages or replayed continuation is denied',()=>{
  const p1=load(envelope([post],cursor1));
  assert.throws(()=>load(envelope([post],null),p1),/Duplicate Calendar record/);
  assert.throws(()=>load(envelope([draft],cursor1),p1),/did not advance/);
});
test('no forged sent status or private recipient fields reach Calendar UI',()=>{
  const x=envelope([{...draft,status:'sent'}],null);
  assert.throws(()=>load(x),/identity, time or authorization/);
  const y=envelope([{...draft,recipients:['private@example.test']}],null);
  assert.throws(()=>load(y),/Unexpected calendar content field/);
  const z=envelope([{...linked,scheduledAtUtcMs:asOf}],null);
  assert.throws(()=>load(z),/own schedule/);
});
test('cursor and truncated flag must exactly agree',()=>{
  const x=envelope([post],null);x.data.truncated=true;
  assert.throws(()=>load(x),/Unsafe or incomplete/);
  const y=envelope([post],cursor1);y.data.truncated=false;
  assert.throws(()=>load(y),/Unsafe or incomplete/);
  const z=envelope([],cursor1);
  assert.throws(()=>load(z),/Unsafe or incomplete/);
  const q=envelope([post],'not-signed');
  assert.throws(()=>load(q),/Unsafe or incomplete/);
  const r=envelope([post],null);
  r.data.private_content='leak';
  assert.throws(()=>load(r),/Unsafe or incomplete/);
});
test('bounded GET pages preserve OAuth bearer solely in Authorization header',()=>{
  const token='hks_pub_synthetic_only';
  const first=buildCalendarPageRequest('https://hakisend.example/',site,token,2);
  assert.equal(first.method,'GET');
  assert.equal(first.url,'https://hakisend.example/api/v1/hakisend/sites/'+site+'/calendar/pages?limit=2');
  const next=buildCalendarPageRequest('https://hakisend.example/',site,token,2,cursor1);
  assert.equal(next.headers.Authorization,'Bearer '+token);
  assert.ok(next.url.endsWith('&cursor='+encodeURIComponent(cursor1)));
  assert.equal(next.url.includes(token),false);
  assert.throws(()=>buildCalendarPageRequest('http://example.test/',site,token,2),/HTTPS/);
  assert.throws(()=>buildCalendarPageRequest('https://hakisend.example/',site,token,2,'fake'),/cursor/);
  assert.throws(()=>buildCalendarPageRequest('https://hakisend.example/',site,token,101),/page size/);
});
