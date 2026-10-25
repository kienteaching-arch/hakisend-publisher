import test from 'node:test';
import assert from 'node:assert/strict';
import {validateR3Payload,sendR3Once,readR3Receipt} from '../src/email/publisher-r3-delivery.ts';
import {PUBLISHING_SCOPES,EMAIL_DRAFT_SCOPES,DELIVERY_SCOPES,verifyConnectScopes} from '../src/email/email-connect-scope.ts';
const site='75422363-ddb9-4b2d-ae7f-9f65090d7407';
const campaign='6add913d3ed7e';
const request='123e4567-e89b-42d3-a456-426614174000';
const token='hks_pub_example_dev_token';
const p={request_uid:request,recipient_count_snapshot:2,consent_basis:'single_optin',consent_source:'Test form 2026-10-25',approval_confirmed:true};
function response(action='send_now'){return {success:true,data:{source:'publisher_r3_delivery_receipt_v1',site_uid:site,campaign_uid:campaign,request_uid:request,action,journal_status:action==='send_now'?'handed_off':'scheduled',recipient_count:2,may_retry:false,inbox_delivered:false}}}
test('old publishing/draft scope remains least privilege',()=>{
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES],false).ok,true);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES],true).ok,true);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES,...DELIVERY_SCOPES],true).ok,false);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES,...DELIVERY_SCOPES],true,true).ok,true);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES],true,true).ok,false);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,...DELIVERY_SCOPES],false,true).ok,false);
});
test('Send Now rejects Schedule fields and missing consent source',()=>{
 validateR3Payload('send_now',p);
 assert.throws(()=>validateR3Payload('send_now',{...p,delivery_date:'2026-10-25'}));
 assert.throws(()=>validateR3Payload('send_now',{...p,consent_source:'no'}));
});
test('Schedule validates clock and explicit timezone',()=>{
 validateR3Payload('schedule',{...p,delivery_date:'2026-11-01',delivery_time:'14:20',timezone:'Asia/Ho_Chi_Minh'});
 assert.throws(()=>validateR3Payload('schedule',{...p,delivery_date:'2026-11-01',delivery_time:'30:12',timezone:'Asia/Ho_Chi_Minh'}));
 assert.throws(()=>validateR3Payload('schedule',{...p,delivery_date:'2026-11-01',delivery_time:'14:20',timezone:'foo'}));
});
test('persist exactly once before POST',async()=>{
 const calls=[];
 const r=await sendR3Once(async req=>{calls.push(req.method);assert.match(req.url,/send-now$/);return {status:202,json:response()};},
 'https://app.hakisend.com',site,campaign,token,'send_now',p,
 async intent=>{calls.push('PERSIST');assert.equal(intent.requestUid,request)});
 assert.deepEqual(calls,['PERSIST','POST']);assert.equal(r.journalStatus,'handed_off');
});
test('no POST if local persistence fails',async()=>{
 let sends=0;
 await assert.rejects(sendR3Once(async()=>{sends++;return {status:202,json:response()};},
 'https://app.hakisend.com',site,campaign,token,'send_now',p,
 async()=>{throw Error('file not writable')}));
 assert.equal(sends,0);
});
test('network ambiguity never causes an automatic retry',async()=>{
 let n=0;
 await assert.rejects(sendR3Once(async()=>{n++;throw Error('timeout')},
 'https://app.hakisend.com',site,campaign,token,'send_now',p,async()=>{}),/NEVER retry/);
 assert.equal(n,1);
});
test('read-only recovery only uses GET and cannot assert Inbox delivery',async()=>{
 const intent={siteUid:site,campaignUid:campaign,requestUid:request,action:'send_now'};
 const r=await readR3Receipt(async req=>{assert.equal(req.method,'GET');return {status:200,json:response()}},
 'https://app.hakisend.com',intent,token);
 assert.equal(r.recipientCount,2);
 await assert.rejects(readR3Receipt(async()=>({status:200,json:{...response(),data:{...response().data,inbox_delivered:true}}}),
 'https://app.hakisend.com',intent,token));
});
