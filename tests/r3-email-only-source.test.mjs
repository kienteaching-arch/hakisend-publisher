import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailOnlyPlanFromMarkdown,validateEmailOnlySource}
 from '../src/email/r3-email-only-source.ts';
import {parseStandalonePlan} from '../src/email/private-draft-contract.ts';
const site='75422363-ddb9-4b2d-ae7f-9f65090d7407';
const input=()=>({
 siteUid:site,listUid:'list.abc-0123',subject:'Independent email',
 preheader:'Read this week',originalPath:'Independent/Letter.md',
 sourceMarkdown:'---\ntitle: My email\n---\n## Introduction\n\nFirst paragraph.\n\nSecond paragraph.'
});
test('Complete Email Only Markdown preserved and parseable by existing Private Draft parser',()=>{
 const result=createEmailOnlyPlanFromMarkdown(input());
 assert.equal(result.body,'## Introduction\n\nFirst paragraph.\n\nSecond paragraph.');
 const path='HakiSend Emails/'+site+'/Email - Independent email.md';
 const field={hakisend_type:'email_campaign',hakisend_email_kind:'standalone',site_uid:site,
   email_subject:'Independent email',email_preheader:'Read this week',email_list_uid:'list.abc-0123'};
 const plan=parseStandalonePlan({path,extension:'md'},field,result.planMarkdown);
 assert.equal(plan.body,result.body);
 assert.equal(plan.listUid,'list.abc-0123');
 assert.equal(plan.preheader,'Read this week');
 assert.equal(plan.draftUid,'');
 assert.equal(plan.requestUid,'');
 assert(!result.planMarkdown.includes('Write the standalone email here.'));
});
test('No Website Post or Post UID is created',()=>{
 const s=createEmailOnlyPlanFromMarkdown(input()).planMarkdown;
 assert.match(s,/hakisend_email_kind: "standalone"/);
 assert.match(s,/email_source_post_uid: ""/);
 assert(!s.includes('hakisend_type: post'));
});
test('Post metadata and direct UID metadata fail closed',()=>{
 for(const header of [
  'hakisend_type: post','post_uid: 123','hakisend_post_uid: 123',
  'email_source_post_uid: 123','hakisend_email_kind: post_linked_free',
  'hakisend_read_only: true','hakisend_import_snapshot: true'
 ]){
   assert.throws(()=>validateEmailOnlySource('---\n'+header+'\n---\nPrivate text','Independent/n.md'),header);
 }
});
test('Free and paid markers cannot be imported as Standalone email',()=>{
 for(const marker of ['<!-- hakisend:free:start -->','<!-- hakisend:free:end -->',
   '<!-- hakisend:paid:start -->','<!-- hakisend:premium:start -->','<!-- paywall -->']){
  assert.throws(()=>validateEmailOnlySource('Public\n'+marker+'\nPaid','Independent/n.md'));
 }
});
test('Import cannot target existing Email Plans, imported Posts or distribution plans',()=>{
 for(const path of ['HakiSend Emails/a.md','HakiSend Imports/p.md','HakiSend Distribution Plans/p.md',
 '../parent.md','/abs.md','file.txt'])
 assert.throws(()=>validateEmailOnlySource('Complete body',path));
});
test('Malformed YAML, empty body, dynamic and oversized markup are denied',()=>{
 assert.throws(()=>validateEmailOnlySource('---\ntitle: abc\nno end','Letters/a.md'));
 assert.throws(()=>validateEmailOnlySource('---\ntitle: abc\n---\n','Letters/a.md'));
 assert.throws(()=>validateEmailOnlySource('Hello {{subscriber}}','Letters/a.md'));
 assert.throws(()=>validateEmailOnlySource('a'.repeat(200001),'Letters/a.md'));
});
test('Unsafe List, Site, subject and preheader block before Vault write',()=>{
 const a=input();
 assert.throws(()=>createEmailOnlyPlanFromMarkdown({...a,listUid:'../admin'}));
 assert.throws(()=>createEmailOnlyPlanFromMarkdown({...a,siteUid:'not-a-uuid'}));
 assert.throws(()=>createEmailOnlyPlanFromMarkdown({...a,subject:'X\nY'}));
 assert.throws(()=>createEmailOnlyPlanFromMarkdown({...a,preheader:'X\nY'}));
});
test('Unicode in source is retained exactly',()=>{
 const a=input();
 const s='Con học qua trải nghiệm 🌱\n\nChào bạn, đây là toàn bộ email.';
 const p=createEmailOnlyPlanFromMarkdown({...a,sourceMarkdown:s});
 assert.equal(p.body,s);
 assert(p.planMarkdown.includes(s));
});
test('Source cannot be confused with local distribution JSON plan',()=>{
 assert.throws(()=>validateEmailOnlySource('{"events":[]}', 'HakiSend Distribution Plans/one.md'));
});
