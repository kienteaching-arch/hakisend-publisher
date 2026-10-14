import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDraftRequest,requestPrivateDraft} from '../src/email/hakisend-draft-api.ts';
const SITE='e7835a5f-7ef7-457c-aa2b-7fa9d4b9cb95';
const DRAFT='90000000-0000-4000-8000-000000000002';
const req=(suffix='drafts',method='GET',payload)=>buildDraftRequest('https://hakisend.example',SITE,'token-for-test',suffix,method,payload);

test('GET audiences uses actual scoped endpoint and bearer authentication',()=>{
  const x=req('audiences');assert.equal(x.url,'https://hakisend.example/api/v1/hakisend/sites/'+SITE+'/emails/audiences');
  assert.equal(x.headers.Authorization,'Bearer token-for-test');assert.equal(x.body,undefined);
});
test('draft list and single-Draft show are allowlisted',()=>{
  assert.equal(req().method,'GET');assert.equal(req('drafts/'+DRAFT).method,'GET');
});
test('POST carries JSON but no command to send or schedule',()=>{
  const x=req('drafts','POST',{request_uid:DRAFT,subject:'Hello'});
  assert.equal(x.headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(x.body),{request_uid:DRAFT,subject:'Hello'});
});
test('PUT requires exact draft identity',()=>assert.equal(req('drafts/'+DRAFT,'PUT',{revision:1}).method,'PUT'));
test('malicious path cannot escape allowlist',()=>assert.throws(()=>req('drafts/../../send'),/Unsupported/));
test('send and promotion endpoints are impossible through transport',()=>{
  for (const suffix of ['send','campaigns','drafts/'+DRAFT+'/send','drafts/'+DRAFT+'/promote']) {
    assert.throws(()=>req(suffix),/Unsupported/);
  }
});
test('refuse insecure HTTP origin',()=>assert.throws(()=>buildDraftRequest('http://localhost',SITE,'x','drafts','GET'),/HTTPS/));
test('refuse path-bearing API origin',()=>assert.throws(()=>buildDraftRequest('https://example.com/admin',SITE,'x','drafts','GET'),/HTTPS/));
test('invalid site identifier rejected',()=>assert.throws(()=>buildDraftRequest('https://example.com','../admin','x','drafts','GET'),/UUID/));
test('missing OAuth token rejected',()=>assert.throws(()=>buildDraftRequest('https://example.com',SITE,'','drafts','GET'),/OAuth/));
test('GET cannot supply a request body',()=>assert.throws(()=>req('drafts','GET',{x:true}),/Unexpected/));
test('POST cannot omit payload',()=>assert.throws(()=>req('drafts','POST'),/Unexpected/));
test('server envelope must contain success=true and data',async()=>{
  const ok=async()=>({status:200,json:{success:true,data:{uid:DRAFT}}});
  assert.deepEqual(await requestPrivateDraft(ok,'https://example.com',SITE,'t','drafts','GET'),{uid:DRAFT});
  const missing=async()=>({status:200,json:{success:true}});
  await assert.rejects(()=>requestPrivateDraft(missing,'https://example.com',SITE,'t','drafts','GET'),/Missing/);
});
test('HTTP 409 preserved without leaking token, raw body or untrusted error message',async()=>{
  const fail=async()=>({status:409,json:{success:false,error:'revision_conflict',debug:'Bearer sensitive'}});
  await assert.rejects(async()=>{
    try{await requestPrivateDraft(fail,'https://example.com',SITE,'secret-token','drafts','GET');}
    catch(e){assert.equal(e.status,409);assert.equal(e.code,'revision_conflict');throw e;}
  },e=>!e.message.includes('secret-token')&&!e.message.includes('sensitive'));
});
test('unknown server error is masked',async()=>{
  const fail=async()=>({status:500,json:{success:false,error:'customer_secret_ABC'}});
  await assert.rejects(()=>requestPrivateDraft(fail,'https://example.com',SITE,'t','drafts','GET'),/request_failed/);
});
