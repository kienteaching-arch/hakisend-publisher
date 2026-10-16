import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseStandalonePlan, isAudience, createDraftMutation, validDraftSummary,
  verifyDraftReadback, verifiedCallout, decorateLocalPlan, isRevisionConflict, canAdoptRevision,
} from '../src/email/private-draft-contract.ts';

const SITE = 'e7835a5f-7ef7-457c-aa2b-7fa9d4b9cb95';
const REQUEST = '90000000-0000-4000-8000-000000000001';
const DRAFT = '90000000-0000-4000-8000-000000000002';
const file = { path: `HakiSend Emails/${SITE}/sample.md`, extension: 'md' };
const fields = () => ({
  hakisend_type: 'email_campaign', hakisend_email_kind: 'standalone', site_uid: SITE,
  email_subject: 'Thử nghiệm', email_preheader: 'Mô tả', email_list_uid: 'first_list',
  hakisend_remote_email_request_uid: REQUEST,
});
const md = '> [!warning] Email plan — local draft, NOT sent or scheduled on HakiSend\n## Email body\nNội dung thử nghiệm';
const audience = [{ uid: 'first_list', name: 'First launch' }];
const draft = (revision=1) => ({
  uid:DRAFT, revision, request_uid:REQUEST, status:'private_draft', send_enabled:false,
  subject:'Thử nghiệm', body_markdown:'Nội dung thử nghiệm',
});

test('v0.1.9 standalone parse retains subject/body and site identity',()=>{
  const p=parseStandalonePlan(file,fields(),md);
  assert.equal(p.siteUid,SITE);
  assert.equal(p.body,'Nội dung thử nghiệm');
  assert.equal(p.subject,'Thử nghiệm');
});
test('post-linked email cannot bypass standalone private Draft pipeline',()=>{
  assert.throws(()=>parseStandalonePlan(file,{...fields(),hakisend_email_kind:'post_linked'},md),/Standalone/);
});
test('reject read-only note and out-of-root paths',()=>{
  assert.throws(()=>parseStandalonePlan(file,{...fields(),hakisend_read_only:true},md),/Read-only/);
  assert.throws(()=>parseStandalonePlan({...file,path:'Private/no.md'},fields(),md),/HakiSend Emails/);
});
test('invalid server site identity rejected',()=>{
  assert.throws(()=>parseStandalonePlan(file,{...fields(),site_uid:'bad'},md),/Site UID/);
});
test('reject empty placeholder and NUL payload',()=>{
  assert.throws(()=>parseStandalonePlan(file,fields(),'## Email body\nWrite the standalone email here.'),/placeholder/);
  assert.throws(()=>parseStandalonePlan(file,fields(),'## Email body\nhi\0'),/placeholder/);
});
test('reject oversized UTF8 subject',()=>{
  assert.throws(()=>parseStandalonePlan(file,{...fields(),email_subject:'ừ'.repeat(130)},md),/too long/);
});
test('reject invalid audience UID',()=>{
  assert.equal(isAudience({uid:'../',name:'hack'}),false);
  assert.equal(isAudience(audience[0]),true);
});
test('POST payload requires stable pre-persisted request UID',()=>{
  const p=parseStandalonePlan(file,fields(),md);
  const m=createDraftMutation(p,audience,'first_list');
  assert.equal(m.method,'POST');assert.equal(m.suffix,'drafts');
  assert.equal(m.payload.request_uid,REQUEST);
  assert.equal(m.payload.list_uid,'first_list');
  assert(!('run_at' in m.payload) && !('send' in m.payload));
  assert.throws(()=>createDraftMutation({...p,requestUid:''},audience,'first_list'),/stable request UID/);
});
test('cannot silently switch or use revoked audience',()=>{
  const p=parseStandalonePlan(file,fields(),md);
  assert.throws(()=>createDraftMutation(p,[],'first_list'),/no longer enabled/);
  assert.throws(()=>createDraftMutation(p,[{uid:'another_list',name:'Other'}],'another_list'),/cannot change/);
});
test('PUT payload includes exact CAS revision',()=>{
  const p=parseStandalonePlan(file,{...fields(),hakisend_remote_email_draft_uid:DRAFT,hakisend_remote_email_revision:3},md);
  const m=createDraftMutation(p,audience,'first_list');
  assert.equal(m.method,'PUT');assert.equal(m.payload.revision,3);
  assert.equal(m.suffix,`drafts/${DRAFT}`);
  assert(!('request_uid' in m.payload));
});
test('incomplete remote update revision blocks write',()=>{
  assert.throws(()=>parseStandalonePlan(file,{...fields(),hakisend_remote_email_draft_uid:DRAFT},md),/revision/);
});
test('private status is mandatory',()=>{
  assert(validDraftSummary(draft()));
  assert(!validDraftSummary({...draft(),send_enabled:true}));
  assert(!validDraftSummary({...draft(),status:'sent'}));
  assert(!validDraftSummary({...draft(),revision:0}));
});
test('verified create requires exact server readback',()=>{
  const p=parseStandalonePlan(file,fields(),md);
  assert.equal(verifyDraftReadback(p,draft(),draft()).uid,DRAFT);
  assert.throws(()=>verifyDraftReadback(p,draft(),{...draft(),body_markdown:'modified'}),/readback differs/);
  assert.throws(()=>verifyDraftReadback(p,draft(),{...draft(),revision:2}),/readback differs/);
  assert.throws(()=>verifyDraftReadback(p,draft(),{...draft(),send_enabled:true}),/not verified/);
});
test('verified create rejects mismatched request UID',()=>{
  const p=parseStandalonePlan(file,fields(),md);
  assert.throws(()=>verifyDraftReadback(p,{...draft(),request_uid:'different'}, {...draft(),request_uid:'different'}),/identity/);
});
test('verified update requires same UID and revision plus one',()=>{
  const p=parseStandalonePlan(file,{...fields(),hakisend_remote_email_draft_uid:DRAFT,hakisend_remote_email_revision:2},md);
  assert.equal(verifyDraftReadback(p,draft(3),draft(3)).revision,3);
  assert.throws(()=>verifyDraftReadback(p,draft(4),draft(4)),/increment mismatch/);
});
test('callout cannot claim a zero or fractional revision',()=>{
  assert.throws(()=>verifiedCallout(0),/Invalid/);
  assert.throws(()=>verifiedCallout(2.5),/Invalid/);
});
test('known generated callout alone is changed and update is idempotent',()=>{
  const changed=decorateLocalPlan(md,3);
  assert(changed.includes('Revision 3 — NOT sent'));
  assert.equal(decorateLocalPlan(changed,3),changed);
  assert(decorateLocalPlan(changed,4).includes('Revision 4 — NOT sent'));
});
test('never overwrite custom author callout',()=>{
  const custom='> [!warning] This is my own callout\n## Email body\nhello';
  assert.equal(decorateLocalPlan(custom,3),custom);
});
test('revision conflict detection requires conflict name and HTTP 409',()=>{
  assert(isRevisionConflict(Error('revision_conflict (HTTP 409).')));
  assert(!isRevisionConflict(Error('revision_conflict (HTTP 401).')));
});
test('revision base can be adopted only for exact UID and newer remote revision',()=>{
  assert(canAdoptRevision(DRAFT,2,draft(3),3));
  assert(!canAdoptRevision(DRAFT,2,draft(3),4));
  assert(!canAdoptRevision(REQUEST,2,draft(3),3));
  assert(!canAdoptRevision(DRAFT,3,draft(3),3));
});
