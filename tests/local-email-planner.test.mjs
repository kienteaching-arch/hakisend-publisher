import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLocalEmailPlan,serializeLocalEmailPlan,localEmailPlanPaths,
  localEmailSourceContext,parseLocalEmailUtcSchedule,
} from '../src/email/local-email-planner.ts';

const site='e7835a5f-7ef7-457c-aa2b-7fa9d4b9cb95';
const foreign='22222222-2222-4222-8222-222222222222';
const now=new Date('2026-10-15T00:00:00Z');
const base={kind:'standalone',siteUid:site,subject:'Bản nháp thử nghiệm',
  listUid:'test_list',sendPolicy:'now'};
test('v0.1.9 local standalone draft is editable and never remote scheduled/sent',()=>{
 const plan=normalizeLocalEmailPlan(base,now);
 assert.equal(plan.status,'local_draft');
 assert.equal(plan.siteUid,site);
 assert.equal(plan.sendPolicy,'now');
 assert.equal(plan.scheduledAtUtc,'');
 const md=serializeLocalEmailPlan(plan);
 assert(md.startsWith('---\nhakisend_type: email_campaign\n'));
 assert(md.includes('hakisend_email_kind: "standalone"'));
 assert(md.includes('## Email body\n\nWrite the standalone email here.'));
 for(const line of ['email_dispatch_ready: false','hakisend_local_only: true',
  'email_store_on_hakisend: false','email_publish_archive: false']){
   assert(md.includes(line));
 }
 assert(!/send_authorized:\s*true/.test(md));
 assert(!/https?:\/\//.test(md));
});
test('owner tested v0.1.9 post-linked plan pins source Site but cannot schedule independently',()=>{
 const plan=normalizeLocalEmailPlan({
   kind:'post_linked_free',siteUid:site,subject:'A future excerpt',
   sourceNote:'Posts/Parenting.md',sourceSiteUid:site,
   postUid:'33333333-3333-4333-8333-333333333333',sendPolicy:'on_publication'
 },now);
 assert.equal(plan.sendPolicy,'on_publication');
 assert.equal(plan.scheduledAtUtc,'');
 assert.equal(plan.storeOnHakisend,false);
 const content=serializeLocalEmailPlan(plan);
 assert(content.includes('## Email introduction (optional)'));
 assert(!content.includes('## Email body'));
 assert(content.includes('email_source_note: "Posts/Parenting.md"'));
 assert(content.includes('email_dispatch_ready: false'));
});
test('Post-linked refuses foreign Site, imported snapshot and unsafe source paths',()=>{
 const raw={kind:'post_linked_free',siteUid:site,subject:'X',
   sendPolicy:'on_publication',sourceNote:'Posts/Parenting.md'};
 assert.throws(()=>normalizeLocalEmailPlan({...raw,sourceSiteUid:foreign},now),/differs/);
 assert.throws(()=>normalizeLocalEmailPlan({...raw,isReadOnlySnapshot:true},now),/Read-only/);
 for(const sourceNote of ['HakiSend Imports/a.md','HakiSend Emails/x.md',
   '../note.md','/tmp/evil.md','Posts/../x.md','Posts\\x.md','Posts/not.txt']){
   assert.throws(()=>normalizeLocalEmailPlan({...raw,sourceNote},now),/editable Post note/);
 }
 assert.throws(()=>normalizeLocalEmailPlan({...raw,sendPolicy:'scheduled'},now),/follow publication/);
 assert.throws(()=>normalizeLocalEmailPlan({...raw,scheduleInput:'2026-10-17T02:00:00Z'},now),/independent send time/);
});
test('Standalone cannot silently bind itself to a Post or schedule send-now intent',()=>{
 assert.throws(()=>normalizeLocalEmailPlan({...base,sourceNote:'Posts/test.md'},now),/must not publish/);
 assert.throws(()=>normalizeLocalEmailPlan({...base,postUid:'x'},now),/must not publish/);
 assert.throws(()=>normalizeLocalEmailPlan({...base,scheduleInput:'2026-10-16T00:00:00Z'},now),/cannot have a schedule/);
});
test('timezone parse explicitly converts safe future offset to UTC, without scheduling',()=>{
 const at=parseLocalEmailUtcSchedule('2026-10-16T08:00:00+07:00',now);
 assert.equal(at,'2026-10-16T01:00:00.000Z');
 const plan=normalizeLocalEmailPlan({...base,sendPolicy:'scheduled',
   scheduleInput:'2026-10-16T08:00:00+07:00'},now);
 assert.equal(plan.scheduledAtUtc,at);
 const md=serializeLocalEmailPlan(plan);
 assert(md.includes('email_scheduled_at_utc: "2026-10-16T01:00:00.000Z"'));
 assert(md.includes('email_dispatch_ready: false'));
});
test('invalid, ambiguous or past schedule cannot create a plan',()=>{
 for(const scheduleInput of [
  '2026-10-16 08:00:00','2026-10-16T08:00:00','2026-02-30T08:00:00Z',
  '2026-10-16T25:00:00Z','2026-10-16T08:00:00+15:00',
  '2026-10-14T08:00:00Z','2026-10-16T08:00:61Z'
 ]){
  assert.throws(()=>normalizeLocalEmailPlan({...base,
    sendPolicy:'scheduled',scheduleInput},now),/time|ISO|date|clock/i);
 }
});
test('safe folder names cannot inject traversal, YAML metadata or file delimiters',()=>{
 const title='Claim:\nstatus: sent /../../\\evil "draft"';
 assert.throws(()=>localEmailPlanPaths(site,'standalone',title),/Email subject/);
 const paths=localEmailPlanPaths(site,'standalone','My: "unsafe" / file');
 assert.equal(paths.directory,'HakiSend Emails/'+site);
 assert.equal(paths.basename,'Email - My unsafe file');
 const quoted=serializeLocalEmailPlan(normalizeLocalEmailPlan({
  ...base,subject:'Offer: "test" # 50%'
 },now));
 assert(quoted.includes('email_subject: "Offer: \\"test\\" # 50%"'));
 assert(!quoted.includes('\nstatus: sent'));
});
test('only current editable Markdown note becomes Post source context',()=>{
 assert.deepEqual(localEmailSourceContext(null,null),{
  sourceNote:'',postUid:'',sourceSiteUid:'',isReadOnlySnapshot:false});
 const source=localEmailSourceContext('Posts/A.md','md',{
  site_uid:site,hakisend_post_uid:'33333333-3333-4333-8333-333333333333',
  hakisend_import_snapshot:true,
 });
 assert.equal(source.sourceSiteUid,site);
 assert.equal(source.isReadOnlySnapshot,true);
 assert.equal(source.postUid,'33333333-3333-4333-8333-333333333333');
});
test('local planner has no HTTP or send-adapter dependency',async()=>{
 const fs=await import('node:fs/promises');
 const code=await fs.readFile(new URL('../src/email/local-email-planner.ts',import.meta.url),'utf8');
 assert(!code.includes('requestUrl('));
 assert(!code.includes('fetch('));
 assert(!code.includes('Campaign::execute'));
});
