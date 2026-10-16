import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromotionRequest,requestPromotion,validatePromotionReceipt,
  explicitlyPromotePrivateDraft,explicitlyRecoverPrivatePromotion,
} from '../src/email/private-draft-promotion.ts';
const SITE='11111111-1111-4111-8111-111111111111';
const DRAFT='22222222-2222-4222-8222-222222222222';
const REQ='33333333-3333-4333-8333-333333333333';
const CAMPAIGN='68efd0066c232'; // Acelle HasUid::generateUid PHP uniqid()
const sender={fromEmail:'verified@example.test',fromName:'CI Sender',replyTo:'reply@example.test'};
const plan={siteUid:SITE,draftUid:DRAFT,revision:3,subject:'Subject',body:'## Hello',preheader:'Intro',listUid:'list-1',requestUid:'other'};
const server={
  uid:DRAFT,subject:'Subject',body_markdown:'## Hello',revision:3,
  status:'private_draft',send_enabled:false,scheduled:false,acelle_campaign_uid:null,
};
const receipt={
  request_uid:REQ,private_draft_uid:DRAFT,campaign_uid:CAMPAIGN,
  status:'new',source_status:'completed',send_enabled:false,scheduled:false,run_at:null,
};
const submitted={campaign_uid:CAMPAIGN,status:'new',send_enabled:false,scheduled:false,run_at:null};
const build=(method,opts={})=>buildPromotionRequest(
  'https://app.example.test',SITE,DRAFT,REQ,'oauth-test-token',method,
  ...(method==='POST'?[3,sender]:[]),...[]
);
test('separate promotion endpoint POST has a strict header-only payload; GET no body',()=>{
  const p=build('POST');
  assert.equal(p.method,'POST');
  assert.equal(p.url,'https://app.example.test/api/v1/hakisend/sites/'+SITE+'/emails/drafts/'+DRAFT+'/campaign-drafts');
  assert.deepEqual(JSON.parse(p.body),{
    request_uid:REQ,revision:3,from_email:sender.fromEmail,
    from_name:sender.fromName,reply_to:sender.replyTo,
  });
  const g=build('GET');
  assert.equal(g.body,undefined);
  assert.equal(g.url,p.url+'/'+REQ);
  assert.equal(g.headers.Authorization,'Bearer oauth-test-token');
});
test('unsafe sender, source identity and origin are blocked',()=>{
  assert.throws(()=>buildPromotionRequest('http://localhost',SITE,DRAFT,REQ,'oauth-test-token','GET'),/HTTPS/);
  assert.throws(()=>buildPromotionRequest('https://example.test/path',SITE,DRAFT,REQ,'oauth-test-token','GET'),/HTTPS/);
  assert.throws(()=>buildPromotionRequest('https://example.test',SITE,'../../',REQ,'oauth-test-token','GET'),/identity/);
  assert.throws(()=>buildPromotionRequest('https://example.test',SITE,DRAFT,REQ,'oauth-test-token','POST',3,{...sender,fromName:'Bad\r\nBcc: a'}),/Sender/);
  assert.throws(()=>buildPromotionRequest('https://example.test',SITE,DRAFT,REQ,'oauth-test-token','GET',3,sender),/Read-only/);
});
test('receipt must match exact request, exact source, real Acelle UID and unsent state',()=>{
  assert.deepEqual(validatePromotionReceipt(receipt,DRAFT,REQ).campaign_uid,CAMPAIGN);
  for(const change of [
    {request_uid:'44444444-4444-4444-8444-444444444444'},
    {private_draft_uid:'55555555-5555-4555-8555-555555555555'},
    {campaign_uid:'33333333-3333-4333-8333-333333333333'},
    {status:'scheduled'},{source_status:'reserved'},{send_enabled:true},
    {scheduled:true},{run_at:'2026-11-01T09:00:00Z'},
  ])assert.throws(()=>validatePromotionReceipt({...receipt,...change},DRAFT,REQ),/receipt/);
});
test('secure explicit promotion: fresh GET -> persist identity -> POST -> receipt GET -> local mark',async()=>{
  const order=[];
  const result=await explicitlyPromotePrivateDraft(plan,REQ,sender,{
    getSourceDraft:async uid=>{order.push('source-GET');assert.equal(uid,DRAFT);return server;},
    persistRequestUid:async uid=>{order.push('persist-uid');assert.equal(uid,REQ);},
    submit:async uid=>{order.push('POST');assert.equal(uid,REQ);return submitted;},
    getReceipt:async uid=>{order.push('receipt-GET');assert.equal(uid,REQ);return receipt;},
    persistVerifiedReceipt:async x=>{order.push('persist-receipt');assert.equal(x.campaign_uid,CAMPAIGN);},
  });
  assert.deepEqual(order,['source-GET','persist-uid','POST','receipt-GET','persist-receipt']);
  assert.equal(result.send_enabled,false);
});
test('changed remote source prevents any local UID persistence or POST',async()=>{
  const order=[];
  await assert.rejects(()=>explicitlyPromotePrivateDraft(plan,REQ,sender,{
    getSourceDraft:async()=>({...server,body_markdown:'new content'}),
    persistRequestUid:async()=>order.push('persist'),
    submit:async()=>order.push('POST'),
    getReceipt:async()=>receipt,
    persistVerifiedReceipt:async()=>order.push('saved'),
  }),/changed/);
  assert.deepEqual(order,[]);
});
test('local persistence failure prevents remote POST',async()=>{
  let submittedCount=0;
  await assert.rejects(()=>explicitlyPromotePrivateDraft(plan,REQ,sender,{
    getSourceDraft:async()=>server,
    persistRequestUid:async()=>{throw Error('local disk full')},
    submit:async()=>{submittedCount++;return submitted},
    getReceipt:async()=>receipt,
    persistVerifiedReceipt:async()=>{},
  }),/disk full/);
  assert.equal(submittedCount,0);
});
test('ambiguous POST result is not retried, nor locally marked',async()=>{
  const order=[];
  await assert.rejects(()=>explicitlyPromotePrivateDraft(plan,REQ,sender,{
    getSourceDraft:async()=>server,persistRequestUid:async()=>order.push('persist-uid'),
    submit:async()=>{order.push('POST');throw Error('timeout');},
    getReceipt:async()=>{throw Error('unexpected GET');},
    persistVerifiedReceipt:async()=>order.push('saved'),
  }),/timeout/);
  assert.deepEqual(order,['persist-uid','POST']);
});
test('read-only manual recovery after lost POST uses only GET, cannot send or POST',async()=>{
  const order=[];
  const x=await explicitlyRecoverPrivatePromotion(plan,REQ,{
    getReceipt:async()=>{order.push('GET');return receipt},
    persistVerifiedReceipt:async()=>order.push('persist-receipt'),
  });
  assert.equal(x.campaign_uid,CAMPAIGN);
  assert.deepEqual(order,['GET','persist-receipt']);
});
test('ambiguous server state never claims promoted NEW, and does not persist',async()=>{
  let saved=false;
  await assert.rejects(()=>explicitlyRecoverPrivatePromotion(plan,REQ,{
    getReceipt:async()=>({...receipt,status:'ambiguous'}),
    persistVerifiedReceipt:async()=>{saved=true},
  }),/receipt/);
  assert.equal(saved,false);
});
test('untrusted server error does not leak request tokens or response body',async()=>{
  const boom=async()=>({status:409,json:{success:false,error:'secret-draft-body'}});
  await assert.rejects(()=>requestPromotion(boom,'https://app.example.test',SITE,DRAFT,REQ,
    'oauth-test-token','GET'),e=>e.status===409 && !e.message.includes('secret'));
});
