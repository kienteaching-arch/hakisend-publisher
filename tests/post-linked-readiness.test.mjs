import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePostLinkedEmail } from '../src/email/post-linked-readiness.ts';
const now = Date.parse('2026-10-13T08:00:00Z');
const post = {
  source:'hakisend_server',siteUid:'site_test_01',postUid:'post_test_01',
  postIsGuestVisible:true,siteDomainRoutable:true,postPublishAtUtcMs:now-1,postUnpublishAtUtcMs:null,
};
const email = {
  source:'hakisend_server',listUid:'mail_list_01',enrollmentUid:'enroll_test_01',
  enrollmentExplicit:true,audienceEnabled:true,listBelongsToCustomer:true,
  siteAndCustomerAuthorized:true,sendScopeGranted:true,senderVerified:true,
  unsubFooterValid:true,templateAuthorized:true,quotaAvailable:true,
  contentOrigin:'verified_guest_render',noPremiumContentVerified:true,contentPostUid:'post_test_01',
};
const base = () => ({post:{...post},email:{...email},ledgerStatus:'absent',nowUtcMs:now});
const reason=(input)=>evaluatePostLinkedEmail(input).reason;

test('allows exact server-verifiable public/free post once',()=>{
  const r=evaluatePostLinkedEmail(base()); assert.equal(r.ready,true);
  assert.equal(r.intentKey,'site_test_01:post_test_01:mail_list_01:enroll_test_01');
});
test('reject client-supplied facts',()=>{const x=base(); x.email.source='client';assert.equal(reason(x),'UNTRUSTED_FACTS')});
test('reject content from a different post',()=>{const x=base();x.email.contentPostUid='post_other';assert.equal(reason(x),'CONTENT_POST_MISMATCH')});
test('reject non-public projection even when publication snapshot exists',()=>{const x=base();x.post.postIsGuestVisible=false;assert.equal(reason(x),'NOT_PUBLIC')});
test('reject non-routable site domain',()=>{const x=base();x.post.siteDomainRoutable=false;assert.equal(reason(x),'NOT_PUBLIC')});
test('future post must wait for actual public time',()=>{const x=base();x.post.postPublishAtUtcMs=now+1000;assert.equal(reason(x),'NOT_DUE')});
test('unpublished post cannot send',()=>{const x=base();x.post.postUnpublishAtUtcMs=now;assert.equal(reason(x),'UNPUBLISHED')});
test('cancelled or disabled audience cannot send',()=>{const x=base();x.email.audienceEnabled=false;assert.equal(reason(x),'NO_AUTHORIZED_ENROLLMENT')});
test('no implicit enrollment',()=>{const x=base();x.email.enrollmentExplicit=false;assert.equal(reason(x),'NO_AUTHORIZED_ENROLLMENT')});
test('cross-tenant access blocked',()=>{const x=base();x.email.listBelongsToCustomer=false;assert.equal(reason(x),'TENANT_OR_ACCESS_DENIED')});
test('send requires separately approved scope',()=>{const x=base();x.email.sendScopeGranted=false;assert.equal(reason(x),'SEND_PERMISSION_MISSING')});
test('sender, unsubscribe and template must all pass',()=>{
  for(const k of ['senderVerified','unsubFooterValid','templateAuthorized']) {
    const x=base();x.email[k]=false;assert.equal(reason(x),'COMPLIANCE_BLOCKED');
  }
});
test('quota fail-closed',()=>{const x=base();x.email.quotaAvailable=false;assert.equal(reason(x),'QUOTA_BLOCKED')});
test('unverified free slice and premium material rejected',()=>{
  const x=base();x.email.contentOrigin='unverified';assert.equal(reason(x),'UNVERIFIED_FREE_CONTENT');
  const y=base();y.email.noPremiumContentVerified=false;assert.equal(reason(y),'UNVERIFIED_FREE_CONTENT');
});
test('idempotency ledger blocks duplicates, in-flight and ambiguous',()=>{
  for(const s of ['reserved','creating','accepted','sent','ambiguous','cancelled']){
    const x=base();x.ledgerStatus=s;assert.equal(reason(x),'ALREADY_RESERVED_OR_TERMINAL');
  }
});
test('republishing Site does not enter intent key',()=>{
  const a=evaluatePostLinkedEmail(base());const b=base();b.post.postPublishAtUtcMs=now-1000;
  assert.equal(evaluatePostLinkedEmail(b).intentKey,a.intentKey);
});
test('Email has no independent schedule; due time is Post time',()=>{
  const r=evaluatePostLinkedEmail(base());assert.equal(r.sendNotBeforeUtcMs,post.postPublishAtUtcMs);
});
test('bad server timestamp is rejected',()=>{
  const x=base();x.nowUtcMs=Number.NaN;assert.equal(reason(x),'INVALID_SERVER_CLOCK');
});
