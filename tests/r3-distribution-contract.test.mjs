import test from 'node:test';
import assert from 'node:assert/strict';
import {stripR3Frontmatter,extractMarkedFreeBlock,r3UtcSchedule,createR3LocalPlan,renderR3LocalPlan}
 from '../src/multichannel/r3-distribution-contract.ts';
const site='75422363-ddb9-4b2d-ae7f-9f65090d7407';
const start='<!-- hakisend:free:start -->',end='<!-- hakisend:free:end -->';
const source='---\nsite_uid: "'+site+'"\n---\n# Post title\n'+start+'\nFree public text.\n'+end+'\n## Private\nPAID_SECRET_123';
const scheduled='2026-11-04T09:00:00+07:00';
const email=(listUid='list-one',templateRef='parent-newsletter')=>({listUid,templateRef,subject:'Parent email',scheduledAt:scheduled});
const post=()=>({mode:'post',siteUid:site,notePath:'Publishing/Post.md',title:'Post title',
 markdown:source,postScheduledAt:'2026-11-01T08:00:00+07:00',lists:[email()],pages:[]});
const only=()=>({mode:'email_only',siteUid:site,notePath:'Letters/Standalone.md',title:'Standalone',
 markdown:'---\ntitle: Standalone\n---\nFirst paragraph.\n\nSecond paragraph.',
 lists:[email()],pages:[]});
const now=new Date('2026-10-25T00:00:00Z');
test('Post Free extracts only explicitly bounded Free, never paid',()=>{
 const plan=createR3LocalPlan(post(),now);
 assert.deepEqual(plan.events.map(e=>e.kind),['site_post','post_free_email']);
 assert.equal(plan.events[1].body,'Free public text.');
 assert(!plan.events[1].body.includes('PAID_SECRET_123'));
 assert(plan.events[0].body.includes('PAID_SECRET_123'));
});
test('Post Free does not silently use excerpt/full post when Free marker missing',()=>{
 assert.throws(()=>createR3LocalPlan({...post(),markdown:'# Public excerpt\n\nPRIVATE_MARKER'},now),/explicit Free/);
});
test('malformed/duplicate/reversed free markers are rejected',()=>{
 for(const markdown of [start+'\nFree',end+'\nFree\n'+start,
  start+'\nFree\n'+end+'\n'+start+'\nMore\n'+end,
  start+'\nFree\n<!-- hakisend:free:unknown -->\n'+end]){
  assert.throws(()=>extractMarkedFreeBlock(markdown));
 }
});
test('Free markers inside code fences cannot spoof free content',()=>{
 const bt=String.fromCharCode(96).repeat(3);
 assert.throws(()=>extractMarkedFreeBlock(bt+'\n'+start+'\nAllowed\n'+end+'\n'+bt),/fence/);
});
test('explicit premium marker inside Free block blocks email',()=>{
 assert.throws(()=>extractMarkedFreeBlock(start+'\nabc\n<!-- hakisend:paid:start -->\n'+end),/Paid/);
});
test('Post with no email does not require Free delimiting',()=>{
 const p=createR3LocalPlan({...post(),lists:[]},now);
 assert.deepEqual(p.events.map(e=>e.kind),['site_post']);
});
test('Standalone is full body without YAML frontmatter and without a Post event',()=>{
 const p=createR3LocalPlan(only(),now);
 assert.deepEqual(p.events.map(e=>e.kind),['standalone_email']);
 assert.equal(p.events[0].body,'First paragraph.\n\nSecond paragraph.');
 assert.equal(p.events[0].sourceNote,undefined);
 assert(!p.events[0].body.includes('title: Standalone'));
});
test('Standalone may not accidentally publish Site or Facebook Post',()=>{
 assert.throws(()=>createR3LocalPlan({...only(),postScheduledAt:scheduled},now));
 assert.throws(()=>createR3LocalPlan({...only(),pages:[{pageId:'123456789',pageName:'Facebook'}]},now));
});
test('Multi-list preserves separate List, template, subject and schedule',()=>{
 const p=createR3LocalPlan({...post(),lists:[
  email('parents','parent-template'),
  {...email('teachers','teacher-template'),subject:'Educator email',scheduledAt:'2026-11-05T10:00:00+07:00'}]},now);
 const events=p.events.filter(e=>e.kind==='post_free_email');
 assert.equal(events.length,2);
 assert.equal(events[0].templateRef,'parent-template');
 assert.equal(events[1].templateRef,'teacher-template');
 assert.equal(events[1].title,'Educator email');
 assert.notEqual(events[0].scheduledAtUtc,events[1].scheduledAtUtc);
 assert.equal(events[0].body,events[1].body);
});
test('Duplicate list and missing template fail closed',()=>{
 assert.throws(()=>createR3LocalPlan({...only(),lists:[email(),email()]},now),/duplicate/);
 assert.throws(()=>createR3LocalPlan({...only(),lists:[email('parents','')]},now),/template/);
});
test('Posts and Facebook Page events are independently scheduled and identified',()=>{
 const p=createR3LocalPlan({...post(),pages:[
 {pageId:'1234567890',pageName:'KIENOS Page',scheduledAt:'2026-11-05T08:00:00+07:00'},
 {pageId:'1234567891',pageName:'Parents Page',scheduledAt:'2026-11-06T08:00:00+07:00'}
 ]},now);
 assert.deepEqual(p.events.map(e=>e.kind),[
 'site_post','post_free_email','facebook_page_post','facebook_page_post']);
 assert.equal(p.events[3].destinationLabel,'Parents Page');
 assert.equal(p.events[0].siteUid,p.events[3].siteUid);
 assert.notEqual(p.events[2].scheduledAtUtc,p.events[3].scheduledAtUtc);
});
test('Duplicate Facebook page ID rejected',()=>{
 assert.throws(()=>createR3LocalPlan({...post(),pages:[
 {pageId:'1234567890',pageName:'A'},{pageId:'1234567890',pageName:'B'}
 ]},now),/duplicate Facebook/);
});
test('Missing or invalid Site, invalid imports and empty source are rejected',()=>{
 assert.throws(()=>createR3LocalPlan({...post(),siteUid:'x'},now),/Site/);
 assert.throws(()=>createR3LocalPlan({...post(),notePath:'HakiSend Imports/p.md'},now));
 assert.throws(()=>createR3LocalPlan({...only(),markdown:'---\nbad frontmatter'},now));
});
test('Correct ISO timezone scheduling and invalid calendar dates',()=>{
 assert.equal(r3UtcSchedule('2026-11-01T09:00:00+07:00',now),'2026-11-01T02:00:00.000Z');
 for(const s of ['2026-11-01 09:00','2026-02-30T09:00:00+07:00',
 '2026-11-01T25:00:00+07:00','2026-11-01T09:00:00+15:00',
 '2026-10-01T09:00:00+07:00']){
  assert.throws(()=>r3UtcSchedule(s,now),s);
 }
});
test('Local artifact is visibly non-executable, never claims a remote receipt',()=>{
 const p=createR3LocalPlan(only(),now),txt=renderR3LocalPlan(p);
 assert.match(txt,/LOCAL ONLY|Local plan only/);
 assert.match(txt,/nothing has been sent/);
 assert(!txt.includes('access_token'));
 assert.equal(p.status,'local_only');
});
test('No receiver list cannot produce a standalone send',()=>{
 assert.throws(()=>createR3LocalPlan({...only(),lists:[]},now),/Select an Email List/);
});
