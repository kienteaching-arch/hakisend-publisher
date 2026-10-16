import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrivateDraftList,parsePrivateDraftDetail} from '../src/email/private-draft-list.ts';
const ID='11111111-1111-4111-8111-111111111111';
const valid={
  uid:ID,subject:'A private Email',revision:2,status:'private_draft',
  send_enabled:false,scheduled:false,acelle_campaign_uid:null,
  preheader:'Sensitive preheader must not be echoed',
};
test('empty and valid owner-filtered summaries remain read-only',()=>{
  assert.deepEqual(parsePrivateDraftList([]),[]);
  assert.deepEqual(parsePrivateDraftList([valid]),[{uid:ID,subject:'A private Email',revision:2}]);
});
test('all unrelated server metadata is discarded',()=>{
  assert.equal(JSON.stringify(parsePrivateDraftList([{...valid, secret:'PRIVATE'}])).includes('PRIVATE'),false);
  assert.equal(JSON.stringify(parsePrivateDraftList([valid])).includes('Sensitive'),false);
});
test('reject attempted body leakage from a list response',()=>{
  assert.throws(()=>parsePrivateDraftList([{...valid,body_markdown:'# Paid content'}]),/Unverified/);
});
test('never claim a draft is scheduled, send-enabled or promoted',()=>{
  for(const fields of [
    {send_enabled:true},{scheduled:true},{acelle_campaign_uid:ID},{status:'sent'},
    {status:'scheduled'},{revision:0},{subject:'\nInjected'},
  ])assert.throws(()=>parsePrivateDraftList([{...valid,...fields}]),/Unverified/);
});
test('reject duplicate draft UID ignoring case',()=>{
  assert.throws(()=>parsePrivateDraftList([valid,{...valid,uid:ID.toUpperCase()}]),/Duplicate/);
});
test('reject unbounded/malformed server list',()=>{
  assert.throws(()=>parsePrivateDraftList({drafts:[valid]}),/Unexpected/);
  assert.throws(()=>parsePrivateDraftList(Array.from({length:51},()=>valid)),/Unexpected/);
  assert.throws(()=>parsePrivateDraftList([null]),/Unverified/);
});

test('read-only detail requires exactly selected private Draft identity',()=>{
  const detail={...valid,body_markdown:'# Private content\nSecond line'};
  assert.deepEqual(parsePrivateDraftDetail(detail,ID),{
    uid:ID,subject:valid.subject,revision:2,body:'# Private content\nSecond line'
  });
  assert.throws(()=>parsePrivateDraftDetail(detail,'22222222-2222-4222-8222-222222222222'),/mismatched/);
  assert.throws(()=>parsePrivateDraftDetail({...detail,status:'sent'},ID),/Unverified/);
  assert.throws(()=>parsePrivateDraftDetail({...detail,scheduled:true},ID),/Unverified/);
  assert.throws(()=>parsePrivateDraftDetail({...detail,body_markdown:null},ID),/Unverified/);
  assert.throws(()=>parsePrivateDraftDetail({...detail,body_markdown:'x'.repeat(200001)},ID),/Unverified/);
});
