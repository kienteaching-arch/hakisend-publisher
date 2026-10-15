import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReadinessRequest,parseDeliveryReadiness,explicitlyReadDeliveryReadiness}
  from '../src/email/delivery-readiness.ts';
const SITE='11111111-1111-4111-8111-111111111111';
const DRAFT='22222222-2222-4222-8222-222222222222';
const REQ='33333333-3333-4333-8333-333333333333';
const CAMPAIGN='68ef0acbd0123';
const checkKeys=[
  'source_is_private_draft','owner_and_site_verified',
  'audience_bound_and_readable','native_campaign_ownership_verified',
  'native_campaign_unscheduled_new','native_campaign_single_list',
  'sender_identity_verified','uploaded_template_owned',
];
const complianceKeys=[
  'unsubscribe','consent','suppression','quota','provider',
  'scheduled_state_receipt','idempotency_handoff','source_revision_at_promotion',
];
const data={
  contract_version:'hks_delivery_readiness_v1',site_uid:SITE,draft_uid:DRAFT,
  request_uid:REQ,campaign_uid:CAMPAIGN,campaign_state:'new',
  checks:Object.fromEntries(checkKeys.map(x=>[x,true])),
  compliance:Object.fromEntries(complianceKeys.map(x=>[x,'unverified'])),
  ready_to_send:false,send_authorized:false,schedule_authorized:false,read_only:true,
};
const parse=(x)=>parseDeliveryReadiness({success:true,data:x},SITE,DRAFT,REQ,CAMPAIGN);
test('readiness is a deliberate GET with bearer; never contains body/schedule/send',()=>{
  const x=buildReadinessRequest('https://app.example.test',SITE,DRAFT,REQ,'test-token');
  assert.equal(x.method,'GET');assert.equal(x.body,undefined);
  assert.equal(x.url,'https://app.example.test/api/v1/hakisend/sites/'+SITE
    +'/emails/drafts/'+DRAFT+'/campaign-drafts/'+REQ+'/readiness');
  assert.equal(x.headers.Authorization,'Bearer test-token');
});
test('refuses insecure/non-origin URL, path attack and unsafe bearer',()=>{
  assert.throws(()=>buildReadinessRequest('http://localhost',SITE,DRAFT,REQ,'12345678'),/HTTPS/);
  assert.throws(()=>buildReadinessRequest('https://app.test/a',SITE,DRAFT,REQ,'12345678'),/HTTPS/);
  assert.throws(()=>buildReadinessRequest('https://app.test',SITE,'../../',REQ,'12345678'),/UID/);
  assert.throws(()=>buildReadinessRequest('https://app.test',SITE,DRAFT,REQ,'bearer\r\nBcc'),/token/);
});
test('valid new native Campaign is explicitly NOT sendable',()=>{
  const r=parse(data);
  assert.equal(r.campaign_uid,CAMPAIGN);
  assert.equal(r.ready_to_send,false);
  assert.equal(r.send_authorized,false);
  assert.equal(r.schedule_authorized,false);
  assert.equal(r.compliance.consent,'unverified');
});
test('rejects forged send permission, schedule or compliance',()=>{
  for(const patch of [
    {ready_to_send:true},{send_authorized:true},{schedule_authorized:true},
    {read_only:false},{compliance:{...data.compliance,consent:'verified'}},
    {compliance:{...data.compliance,quota:true}},
    {checks:{...data.checks,extra_check:true}},
    {checks:{...data.checks,provider_ready:true}},
    {campaign_uid:'33333333-3333-4333-8333-333333333333'},
    {draft_uid:'44444444-4444-4444-8444-444444444444'},
    {request_uid:'55555555-5555-4555-8555-555555555555'},
    {site_uid:'66666666-6666-4666-8666-666666666666'},
  ]) assert.throws(()=>parse({...data,...patch}),/readiness|server-side|compliance/i);
});
test('ambiguous real Campaign is allowed as a blocked diagnostic only',()=>{
  const r=parse({...data,campaign_state:'ambiguous',
    checks:{...data.checks,native_campaign_unscheduled_new:false}});
  assert.equal(r.campaign_state,'ambiguous');
  assert.equal(r.send_authorized,false);
});
test('explicit read only makes single GET, never retries, no POST',async()=>{
  let n=0;
  const read=async req=>{
    n++;assert.equal(req.method,'GET');return {status:200,json:{success:true,data}};
  };
  const result=await explicitlyReadDeliveryReadiness(read,'https://app.test',
    SITE,DRAFT,REQ,CAMPAIGN,'12345678');
  assert.equal(result.ready_to_send,false);
  assert.equal(n,1);
});
test('disabled endpoint and missing receipt fail closed',async()=>{
  let n=0;
  await assert.rejects(()=>explicitlyReadDeliveryReadiness(async req=>{
    n++;return {status:503,json:{success:false,error:'feature_disabled'}};
  },'https://app.test',SITE,DRAFT,REQ,CAMPAIGN,'12345678'),/not available/);
  assert.equal(n,1);
  assert.throws(()=>parseDeliveryReadiness({success:false},SITE,DRAFT,REQ,CAMPAIGN),/unavailable/);
});
