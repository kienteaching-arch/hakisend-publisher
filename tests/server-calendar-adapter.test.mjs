import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHakiSendCalendarV1,projectVerifiedServerCalendar} from '../src/calendar/server-calendar-adapter.ts';

const site='11111111-1111-4111-8111-111111111111';
const uid='22222222-2222-4222-8222-222222222222';
const post={uid,siteUid:site,kind:'post',status:'scheduled',title:'Planned article',
  serverConfirmed:true,scheduledAtUtcMs:Date.parse('2026-10-14T11:00:00Z'),
  sendAuthorized:false};
const email={uid:'33333333-3333-4333-8333-333333333333',siteUid:site,
  kind:'post_linked_email',status:'draft',title:'Unsent campaign draft',
  linkedPostUid:uid,serverConfirmed:true,scheduledAtUtcMs:null,sendAuthorized:false};
const wrap=(items=[post,email])=>({success:true,data:{
  contract_version:'hks_calendar_v1',site_uid:site,as_of_utc_ms:Date.now(),
  events:items,read_only:true,truncated:false
}});
test('source reader contract maps confirmed Post and linked unsent Email safely',()=>{
 const parsed=parseHakiSendCalendarV1(wrap(),site);
 assert.equal(parsed.items.length,2);
 assert.equal(parsed.items[1].scheduledAtUtcMs,null);
 const calendar=projectVerifiedServerCalendar(wrap(),site,'Asia/Ho_Chi_Minh');
 assert.equal(calendar.days.length,1);
 assert.equal(calendar.days[0].entries.length,1);
 assert.equal(calendar.blocked[0].blockedReason,'LINKED_EMAIL_NOT_ENROLLED');
});
test('refuse site mismatch including other tenant even when HTTP success',()=>{
 assert.throws(()=>parseHakiSendCalendarV1(wrap(),'foreign-site'),/non-authoritative/);
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...post,siteUid:'foreign-site'}]),site),/Unsafe/);
});
test('reject unknown contract version and non read-only response',()=>{
 assert.throws(()=>parseHakiSendCalendarV1({...wrap(),data:{...wrap().data,contract_version:'hks_calendar_v2'}},site),/non-authoritative/);
 assert.throws(()=>parseHakiSendCalendarV1({...wrap(),data:{...wrap().data,read_only:false}},site),/non-authoritative/);
});
test('refuse client-forged send approval or local-only event',()=>{
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...email,sendAuthorized:true}]),site),/Unsafe/);
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...post,serverConfirmed:false}]),site),/Unsafe/);
});
test('no phantom delivery schedule from draft Email even if schedule forged',()=>{
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...email,scheduledAtUtcMs:1700000000000}]),site),/Unattested/);
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...email,status:'scheduled'}]),site),/Unattested/);
});
test('standalone Draft cannot become scheduled without server state',()=>{
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...email,kind:'standalone_email',status:'draft',scheduledAtUtcMs:1700000000000}]),site),/Draft/);
});
test('reject duplicate events and excessive result volume',()=>{
 assert.throws(()=>parseHakiSendCalendarV1(wrap([post,post]),site),/Duplicate/);
 assert.throws(()=>parseHakiSendCalendarV1(wrap(Array(301).fill({...post,uid:'x'})),site),/non-authoritative/);
});
test('forbid leaking unknown server fields into UI projection',()=>{
 const parsed=parseHakiSendCalendarV1(wrap([{...post,customer_id:99,private_html:'private',sendPermission:'yes'}]),site);
 assert.equal('customer_id' in parsed.items[0],false);
 assert.equal('private_html' in parsed.items[0],false);
 assert.equal('sendPermission' in parsed.items[0],false);
});
test('strict timestamp and valid title required',()=>{
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...post,scheduledAtUtcMs:Number.NaN}]),site),/Unsafe/);
 assert.throws(()=>parseHakiSendCalendarV1(wrap([{...post,title:''}]),site),/Unsafe/);
});
test('preserve server truncation indicator for paginated UI',()=>{
 const result=wrap([post]);result.data.truncated=true;
 assert.equal(parseHakiSendCalendarV1(result,site).truncated,true);
});
