import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeScheduleDiagnosticRequest,parseNativeScheduleDiagnostic} from '../src/email/native-schedule-diagnostic.ts';

const site='11111111-1111-4111-8111-111111111111';
const campaign='abcdef0123456';
const raw={success:true,data:{
  source:'acelle_native_schedule_diagnostic_v1',site_uid:site,
  campaign_uid:campaign,status:'intent_only_unhanded',
  ledger_revision:2,ledger_status:'reserved',has_ledger_intent:true,
  native_schedule_present:false,native_state_inconsistent:false,
  read_only:true,send_authorized:false,dispatch_authorized:false,
  provider_schedule_confirmed:false,native_schedule_confirmed:false,
  provider_receipt_verified:false,calendar_scheduled_at_utc:null,
}};
test('owner-invoked diagnostic sends only an authenticated GET',()=>{
 const request=buildNativeScheduleDiagnosticRequest(
  'https://hakisend.example/',site,campaign,'OWNER_OAUTH');
 assert.equal(request.method,'GET');
 assert.equal(request.throw,false);
 assert.equal(request.url,'https://hakisend.example/api/v1/hakisend/sites/'+
  site+'/emails/campaigns/'+campaign+'/schedule/diagnostic');
 assert.equal(request.headers.Authorization,'Bearer OWNER_OAUTH');
 assert.equal('body' in request,false);
 assert(!request.url.includes('OWNER_OAUTH'));
});
test('reject tenant misbinding, forged campaign identity, insecure origin and no token',()=>{
 for(const origin of ['http://hakisend.example','https://hakisend.example/path',
  'https://user@hakisend.example','javascript:alert(1)']){
  assert.throws(()=>buildNativeScheduleDiagnosticRequest(origin,site,campaign,'TOKEN'));
 }
 for(const id of ['not-a-site','../../evil']){
  assert.throws(()=>buildNativeScheduleDiagnosticRequest('https://hakisend.example',id,campaign,'TOKEN'));
 }
 for(const id of ['a-uuid-should-not-work','A234567890abc','abcd/../../evil']){
  assert.throws(()=>buildNativeScheduleDiagnosticRequest('https://hakisend.example',site,id,'TOKEN'));
 }
 assert.throws(()=>buildNativeScheduleDiagnosticRequest('https://hakisend.example',site,campaign,'X\r\nBad: header'));
});
test('validated server diagnostic does not become send or schedule permission',()=>{
 const d=parseNativeScheduleDiagnostic(raw,site,campaign);
 assert.equal(d.status,'intent_only_unhanded');
 assert.equal(d.nativeMarkerPresent,false);
 assert.match(d.message,/internal ledger/);
 assert.equal('send_authorized' in d,false);
 assert.equal('calendar_scheduled_at_utc' in d,false);
 assert.equal(JSON.stringify(d).includes('OWNER_OAUTH'),false);
});
test('native scheduled marker remains explicitly unattested',()=>{
 const data={...raw.data,status:'native_schedule_unattested',
  native_schedule_present:true,has_ledger_intent:true};
 const parsed=parseNativeScheduleDiagnostic({success:true,data},site,campaign);
 assert.match(parsed.message,/not verified/);
 assert.equal(parsed.nativeMarkerPresent,true);
});
test('missing mandatory fail-closed booleans, fabricated send or time are rejected',()=>{
 for(const changes of [
  {send_authorized:true},{dispatch_authorized:true},
  {provider_receipt_verified:true},{native_schedule_confirmed:true},
  {provider_schedule_confirmed:true},{calendar_scheduled_at_utc:'2026-10-16T09:00:00Z'},
  {read_only:false},{site_uid:'22222222-2222-4222-8222-222222222222'},
  {campaign_uid:'fedcba0123456'},{status:'sent'},{ledger_revision:0},
  {native_schedule_present:'true'},{has_ledger_intent:null},
 ]){
  assert.throws(()=>parseNativeScheduleDiagnostic({
   success:true,data:{...raw.data,...changes}},site,campaign));
 }
 assert.throws(()=>parseNativeScheduleDiagnostic({success:false,data:raw.data},site,campaign));
});
test('native schedule source cannot return private content to UI',()=>{
 const result=parseNativeScheduleDiagnostic({
  success:true,data:{...raw.data,email_body:'DO NOT RENDER',recipient_email:'secret@example.test'},
 },site,campaign);
 assert(!JSON.stringify(result).includes('DO NOT RENDER'));
 assert(!JSON.stringify(result).includes('secret@example.test'));
});
