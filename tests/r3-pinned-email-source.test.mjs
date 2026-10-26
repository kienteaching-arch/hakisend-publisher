import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPinnedEmailSource} from '../src/email/r3-pinned-email-source.ts';
const site='75422363-ddb9-4b2d-ae7f-9f65090d7407';
const draftUid='123e4567-e89b-42d3-a456-426614174001';
const createUid='123e4567-e89b-42d3-a456-426614174000';
const promoteUid='123e4567-e89b-42d3-a456-426614174002';
const campaign='abcd123456789';
const plan={siteUid:site,draftUid,requestUid:createUid,revision:2,
 listUid:'owned-list-01',subject:'Full standalone email',preheader:'Details inside',
 body:'Entire standalone Markdown\n\nIncludes every paragraph.'};
const remote={uid:draftUid,request_uid:createUid,revision:2,
 list_uid:plan.listUid,subject:plan.subject,preheader:plan.preheader,
 body_markdown:plan.body,status:'private_draft',send_enabled:false,
 scheduled:false,acelle_campaign_uid:null};
const receipt={request_uid:promoteUid,private_draft_uid:draftUid,
 campaign_uid:campaign,status:'new',source_status:'completed',
 send_enabled:false,scheduled:false,run_at:null};
const run=(p=plan,d=remote,r=receipt,c=campaign,q=promoteUid)=>
 verifyPinnedEmailSource(p,c,q,d,r);
test('Verifies exact remote Markdown and native Campaign provenance before approval',()=>{
 const verified=run();
 assert.deepEqual(verified,{siteUid:site,draftUid,draftRevision:2,
  campaignUid:campaign,promotionRequestUid:promoteUid,
  subject:plan.subject,listUid:plan.listUid,body:plan.body,preheader:plan.preheader});
});
test('Edited local email cannot silently send the old promoted campaign body',()=>{
 assert.throws(()=>run({...plan,body:plan.body+'\nLOCAL CHANGES'}),/edited or remote/);
 assert.throws(()=>run({...plan,subject:'Edited subject'}),/edited or remote/);
 assert.throws(()=>run({...plan,preheader:'Edited preview'}),/edited or remote/);
});
test('Remote Draft changed or local revision stale is not deliverable',()=>{
 assert.throws(()=>run(plan,{...remote,body_markdown:'remote update'}));
 assert.throws(()=>run({...plan,revision:3}));
 assert.throws(()=>run(plan,{...remote,revision:3}));
});
test('Cross-List or request ID substitution is rejected',()=>{
 assert.throws(()=>run(plan,{...remote,list_uid:'other-owner-list'}));
 assert.throws(()=>run(plan,{...remote,request_uid:'123e4567-e89b-42d3-a456-426614174004'}));
 assert.throws(()=>run({...plan,listUid:'changed-list'}));
});
test('A forged sent or scheduled Draft is not accepted as original source',()=>{
 for(const patch of [{send_enabled:true},{scheduled:true},
  {status:'published'},{acelle_campaign_uid:campaign}]){
  assert.throws(()=>run(plan,{...remote,...patch}));
 }
});
test('Promotion must still be exactly NEW and unlaunched before Send/Schedule',()=>{
 for(const patch of [{status:'done'},{scheduled:true},{send_enabled:true},
  {run_at:'2026-10-27T00:00:00Z'},{source_status:'pending'}]){
   assert.throws(()=>run(plan,remote,{...receipt,...patch}));
 }
});
test('Changing Campaign or promotion request fails closed',()=>{
 assert.throws(()=>run(plan,remote,receipt,'012345678abcd'));
 assert.throws(()=>run(plan,remote,receipt,campaign,'123e4567-e89b-42d3-a456-426614174003'));
 assert.throws(()=>run(plan,remote,{...receipt,campaign_uid:'012345678abcd'}));
});
test('Malformed UID or nonexistent local identity cannot authorize delivery',()=>{
 assert.throws(()=>run({...plan,draftUid:''}));
 assert.throws(()=>run({...plan,requestUid:''}));
 assert.throws(()=>run({...plan,revision:undefined}));
 assert.throws(()=>run(plan,remote,receipt,'INVALID'));
});
test('Missing GET data is fail-closed rather than retrying POST',()=>{
 assert.throws(()=>run(plan,null));
 assert.throws(()=>run(plan,remote,null));
 assert.throws(()=>run(plan,{},receipt));
});
