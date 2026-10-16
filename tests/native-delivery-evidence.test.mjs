import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeDeliveryEvidenceGet,parseNativeDeliveryEvidence,
} from '../src/email/native-delivery-evidence.ts';

const site='11111111-1111-4111-8111-111111111111';
const campaign='abcdef0123456';
const example={success:true,data:{
 contract_version:'hks_acelle_native_message_evidence_v1',
 site_uid:site,campaign_uid:campaign,campaign_native_status:'sending',
 ledger_status:'handoff_started',ledger_revision:2,
 acelle_recorded_sent:3,acelle_recorded_failed:1,
 acelle_recorded_duplicate:1,acelle_tracked_total:5,
 tracked_with_bounce:1,tracked_with_complaint:1,
 unexpected_native_activity:false,
 evidence_kind:'acelle_local_tracking_counts_only',
 provider_handoff_receipt_verified:false,
 mailbox_delivery_verified:false,
 campaign_delivery_complete_verified:false,
 calendar_delivery_confirmed_at_utc:null,
 send_authorized:false,dispatch_authorized:false,read_only:true,
}};
test('native delivery evidence is a single OAuth GET with no recipients and no writes',()=>{
 const q=buildNativeDeliveryEvidenceGet('https://hakisend.example/',site,campaign,'SECRET_TOKEN');
 assert.equal(q.method,'GET');
 assert.equal(q.throw,false);
 assert.equal(q.url,'https://hakisend.example/api/v1/hakisend/sites/'+site+
   '/emails/campaigns/'+campaign+'/delivery/evidence');
 assert.equal('body' in q,false);
 assert(!q.url.includes('SECRET_TOKEN'));
});
test('insecure origins, foreign Site names, invalid native Campaign and header injection denied',()=>{
 for(const url of ['http://hakisend.example','https://hakisend.example/a',
   'https://me@hakisend.example','javascript:bad()']){
  assert.throws(()=>buildNativeDeliveryEvidenceGet(url,site,campaign,'TOKEN'));
 }
 for(const name of ['../../site','site-uid']){
  assert.throws(()=>buildNativeDeliveryEvidenceGet('https://hakisend.example',name,campaign,'TOKEN'));
 }
 for(const uid of ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ABCDEF0123456','../../../secrets']){
  assert.throws(()=>buildNativeDeliveryEvidenceGet('https://hakisend.example',site,uid,'TOKEN'));
 }
 assert.throws(()=>buildNativeDeliveryEvidenceGet('https://hakisend.example',site,campaign,'fake\r\nHeader: x'));
});
test('correct Acelle sent/bounce/complaint logs never claim mailbox delivery',()=>{
 const d=parseNativeDeliveryEvidence(example,site,campaign);
 assert.equal(d.acelleRecordedSent,3);
 assert.equal(d.acelleRecordedFailed,1);
 assert.equal(d.acelleRecordedDuplicate,1);
 assert.equal(d.trackedWithBounce,1);
 assert.equal(d.trackedWithComplaint,1);
 assert.equal(d.ledgerRevision,2);
 assert.match(d.disclosure,/NOT verified/);
 assert.equal('send_authorized' in d,false);
 assert.equal('provider_handoff_receipt_verified' in d,false);
});
test('forged send, provider, calendar or inbox results refused',()=>{
 const variants=[
  {send_authorized:true},{dispatch_authorized:true},
  {mailbox_delivery_verified:true},{provider_handoff_receipt_verified:true},
  {campaign_delivery_complete_verified:true},
  {calendar_delivery_confirmed_at_utc:'2026-10-16T01:00:00Z'},
  {read_only:false},{campaign_uid:'fffffffffffff'},
  {site_uid:'22222222-2222-4222-8222-222222222222'},
  {acelle_recorded_sent:-1},{acelle_recorded_sent:1.5},
  {acelle_tracked_total:500},{tracked_with_bounce:6},
  {ledger_status:'delivered'},{campaign_native_status:'mailbox-delivered'},
  {ledger_revision:0},{evidence_kind:'provider_receipt'},
 ];
 for(const patch of variants){
  assert.throws(()=>parseNativeDeliveryEvidence({
   success:true,data:{...example.data,...patch}},site,campaign),
   'forgery should be refused: '+Object.keys(patch)[0]);
 }
});
test('no handoff with logs must be visibly flagged, never silently repaired',()=>{
 const data={...example.data,ledger_status:'reserved',unexpected_native_activity:true};
 const result=parseNativeDeliveryEvidence({success:true,data},site,campaign);
 assert.equal(result.unexpectedNativeActivity,true);
 assert.throws(()=>parseNativeDeliveryEvidence({
  success:true,data:{...data,unexpected_native_activity:false}},site,campaign));
});
test('server-only private extra fields never reach Obsidian UI output',()=>{
 const d=parseNativeDeliveryEvidence({success:true,data:{
  ...example.data,email:'secret@example.test',message_id:'PRIVATE',
  oauth:'SECRET_TOKEN',raw_provider_receipt:'NOT VERIFIED',
 }},site,campaign);
 const safe=JSON.stringify(d);
 for(const needle of ['secret@example.test','PRIVATE','SECRET_TOKEN','NOT VERIFIED']) {
   // The static safe disclosure legitimately contains "NOT verified"
   // in different lettercase but not a raw provider receipt.
   assert(!safe.includes(needle));
 }
});
