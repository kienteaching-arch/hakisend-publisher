import test from 'node:test';
import assert from 'node:assert/strict';
import {planManualMarkdownSync} from '../src/sync/manual-markdown-sync-plan.ts';
const SHA=(c)=>c.repeat(64);
const baseline={
 siteUid:'site_01',postUid:'post_01',localPath:'Articles/post.md',
 localSha256:SHA('a'),remoteSha256:SHA('a'),
 remoteStateToken:SHA('b'),baseLocalSha256:SHA('a'),
 baseRemoteStateToken:SHA('b'),remoteEditableMarkdown:true,
 serverCasSupported:true
};
const all={kind:'sync_all',confirmedByUser:true};
const selected=(...postKeys)=>({kind:'selected',confirmedByUser:true,postKeys});
const plan=(record=baseline)=>planManualMarkdownSync([record],all)[0];

test('requires current explicit Sync All or selected Post action',()=>{
 assert.throws(()=>planManualMarkdownSync([baseline],null),/explicit/);
 assert.throws(()=>planManualMarkdownSync([baseline],{kind:'sync_all',confirmedByUser:false}),/explicit/);
 assert.throws(()=>planManualMarkdownSync([baseline],selected()),/at least one/);
});
test('no mutations for matching baseline',()=>{
 assert.deepEqual(plan().action,'no_change');
 assert.equal(plan().requiresConfirmation,false);
});
test('local-only update requires separate confirmation and current server CAS',()=>{
 const r=plan({...baseline,localSha256:SHA('c')});
 assert.equal(r.action,'review_push');
 assert.equal(r.expectedRemoteToken,SHA('b'));
 assert.equal(r.requiresConfirmation,true);
});
test('when CAS unavailable local writes are blocked',()=>{
 const r=plan({...baseline,localSha256:SHA('c'),serverCasSupported:false});
 assert.equal(r.action,'blocked');assert.equal(r.expectedRemoteToken,null);
});
test('remote-only update can only be reviewed with backup',()=>{
 const r=plan({...baseline,remoteStateToken:SHA('c')});
 assert.equal(r.action,'review_pull');
 assert.equal(r.requiresConfirmation,true);
});
test('both changed returns conflict; preserve both versions',()=>{
 const r=plan({...baseline,localSha256:SHA('c'),remoteStateToken:SHA('d')});
 assert.equal(r.action,'conflict');assert.equal(r.createsConflictCopy,true);
});
test('HTML-only remote cannot overwrite Markdown note',()=>{
 assert.equal(plan({...baseline,remoteEditableMarkdown:false}).action,'blocked');
});
test('missing accepted sync baseline is not treated as safe',()=>{
 assert.equal(plan({...baseline,baseRemoteStateToken:null}).action,'review_initial_pair');
});
test('remote-only offers review import; never writes',()=>{
 const r=plan({...baseline,localPath:null,localSha256:null});
 assert.equal(r.action,'review_import');assert.equal(r.requiresConfirmation,true);
});
test('remote/local deletion requires independent separate approval',()=>{
 assert.equal(plan({...baseline,remoteDeleted:true}).action,'blocked');
 assert.equal(plan({...baseline,localDeleted:true}).action,'blocked');
});
test('selection is exact Site + Post pair and does not touch other Site',()=>{
 const items=[baseline,{...baseline,siteUid:'site_02',localPath:'Other/post.md'}];
 const r=planManualMarkdownSync(items,selected('site_02:post_01'));
 assert.equal(r.length,1);assert.equal(r[0].key,'site_02:post_01');
});
test('Sync All includes every unique pair and retains their ordering',()=>{
 const items=[baseline,{...baseline,postUid:'post_02',localPath:'Articles/two.md'}];
 assert.deepEqual(planManualMarkdownSync(items,all).map(x=>x.key),['site_01:post_01','site_01:post_02']);
});
test('reject invalid selection and duplicate Post keys',()=>{
 assert.throws(()=>planManualMarkdownSync([baseline],selected('site_02:post_01')),/not found/);
 assert.throws(()=>planManualMarkdownSync([baseline,baseline],all),/Duplicate remote Post/);
});
test('reject file path traversal, absolute path and duplicate path collisions',()=>{
 for (const localPath of ['/etc/.env','../outside.md','Sub/../note.md','C:\\Secrets\\note.md']){
  assert.throws(()=>plan({...baseline,localPath}),/Unsafe/);
 }
 assert.throws(()=>planManualMarkdownSync([baseline,{...baseline,postUid:'post_02',localPath:'articles/POST.md'}],all),/same local file/);
});
test('reject malformed hash and untrusted identity',()=>{
 assert.throws(()=>plan({...baseline,remoteStateToken:'bad'}),/checksum/);
 assert.throws(()=>plan({...baseline,siteUid:'../../evil'}),/identity/);
});
