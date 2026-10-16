import test from 'node:test';
import assert from 'node:assert/strict';
import {
 verifyConnectScopes,verifyEmailReconnectSitesProbe,
 PUBLISHING_SCOPES,EMAIL_DRAFT_SCOPES
} from '../src/email/email-connect-scope.ts';

test('v0.1.9 publishing-only flow accepts exact five scopes',()=>{
 const x=verifyConnectScopes([...PUBLISHING_SCOPES],false);
 assert.equal(x.ok,true);
 assert.equal(x.scopes.length,5);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES],true).ok,false);
});
test('v0.1.9 draft reconnect requires exactly seven owner-approved scopes',()=>{
 const x=verifyConnectScopes([...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES],true);
 assert.equal(x.ok,true);
 assert.equal(x.scopes.length,7);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES],false).ok,false);
});
test('no send/schedule/admin scope can enter the Email Draft connection',()=>{
 for(const privileged of ['email:send','email:schedule','admin','*','sites:delete']){
   const scopes=[...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES,privileged];
   assert.equal(verifyConnectScopes(scopes,true).ok,false,privileged);
 }
});
test('missing, duplicated or malformed scopes preserve old authorization',()=>{
 assert.equal(verifyConnectScopes(null,true).ok,false);
 assert.equal(verifyConnectScopes('email:read',true).ok,false);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,'email:read'],true).ok,false);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,...EMAIL_DRAFT_SCOPES,'email:read'],true).ok,false);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,' email:read','email:compose'],true).ok,false);
 assert.equal(verifyConnectScopes([...PUBLISHING_SCOPES,'email:read',null],true).ok,false);
});
test('scope order does not alter evidence and input array is never mutated',()=>{
 const input=[...EMAIL_DRAFT_SCOPES,...PUBLISHING_SCOPES].reverse();
 const before=[...input];
 assert.equal(verifyConnectScopes(input,true).ok,true);
 assert.deepEqual(input,before);
});
test('new token must read a valid owner Site list before replacement',()=>{
 const ok={success:true,data:{sites:[{uid:'11111111-1111-4111-8111-111111111111',name:'Site'}]}};
 assert.equal(verifyEmailReconnectSitesProbe(200,ok),true);
 assert.equal(verifyEmailReconnectSitesProbe(200,{success:true,data:[]}),true);
 for(const [status,payload] of [
   [401,ok],[403,ok],[503,ok],[200,{success:false,data:[]}],
   [200,{success:true,data:{}}],[200,{success:true,data:{sites:[{uid:1}]}}],
   [200,{success:true,data:{sites:[null]}}],[200,{success:true,data:123}]
 ]){
   assert.equal(verifyEmailReconnectSitesProbe(status,payload),false);
 }
});
