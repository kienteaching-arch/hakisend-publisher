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
  'native_unsubscribe_markup_present',
];
const complianceKeys=[
  'unsubscribe','consent','suppression','quota','provider',
  'scheduled_state_receipt','idempotency_handoff','source_revision_at_promotion',
];
const data={
  contract_version:'hks_delivery_readiness_v1',site_uid:SITE,draft_uid:DRAFT,
  request_uid:REQ,campaign_uid:CAMPAIGN,campaign_state:'new',
  checks:Object.fromEntries(checkKeys.map(x=>[x,true])),
  audience_status_counts:{
    source:'owner_list_status_snapshot',
    subscribed:2,unsubscribed:1,blacklisted:1,
    spam_reported:1,unconfirmed:1,other:1,total:7,
    consent_verified:false,suppression_verified:false,
  },
  blacklist_overlap:{
    source:'acelle_owner_list_blacklist_overlap_v1',
    subscribed_total:2,
    owner_blacklist_overlap:1,
    global_blacklist_overlap:1,
    either_blacklist_overlap:1,
    without_either_blacklist_overlap:1,
    global_blacklist_policy:'unverified',
    suppression_verified:false,
    recipient_send_authorized:false,
  },
  budget_snapshot:{
    source:'acelle_cold_credit_plan_rate_snapshot_v1',
    credit_state:'no_active_subscription',
    credits_remaining_snapshot:null,rate_limit_configured:false,
    rate_limit_per_window:null,rate_window_amount:null,rate_window_unit:null,
    live_credit_balance_verified:false,live_rate_window_verified:false,
    quota_verified:false,send_authorized:false,
  },
  consent_provenance:{
    source:'acelle_subscriber_type_metadata_v1',
    double_optin_label:1,single_optin_label:0,imported_label:1,
    admin_added_label:0,other_or_missing_label:0,
    ip_metadata_present:1,subscribed_total:2,
    double_optin_receipt_verified:false,
    marketing_purpose_consent_verified:false,
    consent_audit_complete:false,send_authorized:false,
  },
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
  assert.equal(r.checks.native_unsubscribe_markup_present,true);
  assert.equal(r.compliance.unsubscribe,'unverified');
  assert.equal(r.audience_status_counts.subscribed,2);
  assert.equal(r.audience_status_counts.consent_verified,false);
  assert.equal(r.blacklist_overlap.either_blacklist_overlap,1);
  assert.equal(r.blacklist_overlap.suppression_verified,false);
  assert.equal(r.budget_snapshot.credit_state,'no_active_subscription');
  assert.equal(r.budget_snapshot.quota_verified,false);
  assert.equal(r.consent_provenance.double_optin_label,1);
  assert.equal(r.consent_provenance.marketing_purpose_consent_verified,false);
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
test('missing canonical unsubscribe markup is a failed structural check, never send permission',()=>{
  const r=parse({...data,checks:{...data.checks,native_unsubscribe_markup_present:false}});
  assert.equal(r.checks.native_unsubscribe_markup_present,false);
  assert.equal(r.compliance.unsubscribe,'unverified');
  assert.equal(r.send_authorized,false);
});
test('aggregates do not prove opt-in or suppression and fail closed on spoofed/invalid counts',()=>{
  for(const patch of [
    {total:8},{subscribed:-1},{subscribed:2.5},{consent_verified:true},
    {suppression_verified:true},{source:'global_verified'},
    {email_address:'leak@example.test'},{other:Number.MAX_SAFE_INTEGER},
  ]){
    assert.throws(()=>parse({...data,
      audience_status_counts:{...data.audience_status_counts,...patch}
    }),/audience|aggregate|total|Untrusted/i);
  }
});
test('strict local/global blacklist overlap contract, no false suppression permission',()=>{
  for(const patch of [
    {subscribed_total:3},{owner_blacklist_overlap:3},
    {global_blacklist_overlap:-1},{either_blacklist_overlap:0},
    {without_either_blacklist_overlap:2},{source:'fake'},
    {global_blacklist_policy:'enabled'},{suppression_verified:true},
    {recipient_send_authorized:true},{email:'private@example.test'},
    {without_either_blacklist_overlap:NaN},
  ]){
    assert.throws(()=>parse({...data,blacklist_overlap:{
      ...data.blacklist_overlap,...patch
    }}),/overlap|Blacklist|blacklist/i);
  }
  const allowed=parse({...data,blacklist_overlap:{
    ...data.blacklist_overlap,owner_blacklist_overlap:1,
    global_blacklist_overlap:2,either_blacklist_overlap:2,
    without_either_blacklist_overlap:0,
  }});
  assert.equal(allowed.compliance.suppression,'unverified');
  assert.equal(allowed.send_authorized,false);
});
test('plan-credit snapshot and rate limits are diagnostic only, never real-time quota',()=>{
  const limited={...data.budget_snapshot,
    credit_state:'limited_in_snapshot',credits_remaining_snapshot:40,
    rate_limit_configured:true,rate_limit_per_window:100,
    rate_window_amount:1,rate_window_unit:'hour',
  };
  const accepted=parse({...data,budget_snapshot:limited});
  assert.equal(accepted.budget_snapshot.quota_verified,false);
  assert.equal(accepted.send_authorized,false);
  for(const bad of [
    {quota_verified:true},{send_authorized:true},
    {live_credit_balance_verified:true},{live_rate_window_verified:true},
    {credits_remaining_snapshot:-1},{credits_remaining_snapshot:1.25},
    {rate_limit_per_window:-5},{rate_window_amount:0},
    {rate_window_unit:'forever'},{private_subscription_id:55},
  ]){
    assert.throws(()=>parse({...data,
      budget_snapshot:{...limited,...bad}
    }),/quota|credit|rate|snapshot|Unsafe/i);
  }
  assert.throws(()=>parse({...data,budget_snapshot:{
    ...limited,credit_state:'unlimited_in_snapshot'
  }}),/credit|snapshot/);
  assert.throws(()=>parse({...data,budget_snapshot:{
    ...data.budget_snapshot,credit_state:'limited_in_snapshot'
  }}),/credit|snapshot/);
});
test('double opt-in type and IP are only hints, never authoritative marketing consent',()=>{
  const verified=parse(data);
  assert.equal(verified.compliance.consent,'unverified');
  assert.equal(verified.consent_provenance.consent_audit_complete,false);
  for(const patch of [
    {marketing_purpose_consent_verified:true},
    {double_optin_receipt_verified:true},
    {consent_audit_complete:true},{send_authorized:true},
    {double_optin_label:2},{imported_label:-1},
    {ip_metadata_present:3},{subscribed_total:3},
    {source:'consent_registry_verified'},
    {subscribed_total:NaN},{contact_email:'private@example.test'},
  ]){
    assert.throws(()=>parse({...data,consent_provenance:{
      ...data.consent_provenance,...patch
    }}),/consent|provenance|Untrusted/i);
  }
  const allDouble=parse({...data,consent_provenance:{
    ...data.consent_provenance,double_optin_label:2,imported_label:0,
    ip_metadata_present:2,
  }});
  assert.equal(allDouble.consent_provenance.marketing_purpose_consent_verified,false);
  assert.equal(allDouble.send_authorized,false);
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
