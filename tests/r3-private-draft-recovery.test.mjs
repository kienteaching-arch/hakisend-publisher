import test from 'node:test';
import assert from 'node:assert/strict';
import {locateDraftForRecovery,verifyRecoveredPrivateDraft}
 from '../src/email/r3-private-draft-recovery.ts';
const site='75422363-ddb9-4b2d-ae7f-9f65090d7407';
const uid='123e4567-e89b-42d3-a456-426614174001';
const req='123e4567-e89b-42d3-a456-426614174000';
const plan={siteUid:site,listUid:'list-a',draftUid:'',requestUid:req,revision:undefined,
 subject:'My email',preheader:'Preview',body:'A complete email'};
const row={uid,request_uid:req,list_uid:'list-a',subject:'My email',preheader:'Preview',
 status:'private_draft',send_enabled:false,scheduled:false,acelle_campaign_uid:null,revision:1};
const detail={...row,body_markdown:'A complete email'};
test('Exact GET index and body recover unresolved draft without POST',()=>{
 assert.equal(locateDraftForRecovery([row],plan),uid);
 assert.deepEqual(verifyRecoveredPrivateDraft(detail,plan,uid),{uid,revision:1});
});
test('No request UID or already-resolved Draft cannot be recovered',()=>{
 assert.throws(()=>locateDraftForRecovery([row],{...plan,requestUid:''}));
 assert.throws(()=>locateDraftForRecovery([row],{...plan,draftUid:uid}));
});
test('Missing or duplicate index request requires manual reconciliation',()=>{
 assert.throws(()=>locateDraftForRecovery([],plan));
 assert.throws(()=>locateDraftForRecovery([row,row],plan));
});
test('Wrong List, subject or preheader cannot be adopted',()=>{
 for(const changed of [{list_uid:'another'},{subject:'wrong'},{preheader:'wrong'}])
 assert.throws(()=>locateDraftForRecovery([{...row,...changed}],plan));
});
test('Recovered GET detail must match complete body exactly',()=>{
 assert.throws(()=>verifyRecoveredPrivateDraft({...detail,body_markdown:'Another body'},plan,uid));
 assert.throws(()=>verifyRecoveredPrivateDraft({...detail,request_uid:'something-else'},plan,uid));
 assert.throws(()=>verifyRecoveredPrivateDraft({...detail,acelle_campaign_uid:'abcdef0123456'},plan,uid));
});
test('Delivered/scheduled forged Draft is never adopted as private draft',()=>{
 assert.throws(()=>verifyRecoveredPrivateDraft({...detail,send_enabled:true},plan,uid));
 assert.throws(()=>verifyRecoveredPrivateDraft({...detail,scheduled:true},plan,uid));
});
test('Oversized Draft index fails closed',()=>{
 assert.throws(()=>locateDraftForRecovery(Array(51).fill(row),plan));
});
test('Revision is retrieved from server and must be positive integer',()=>{
 assert.throws(()=>verifyRecoveredPrivateDraft({...detail,revision:0},plan,uid));
 assert.throws(()=>verifyRecoveredPrivateDraft({...detail,revision:1.5},plan,uid));
});
