import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyManualConflictAdoption,markManualConflictPending} from '../src/email/manual-conflict-adoption.ts';
import {extractStandaloneEmailBody} from '../src/email/private-draft-contract.ts';
const site='11111111-1111-4111-8111-111111111111';
const uid='22222222-2222-4222-8222-222222222222';
const plan={siteUid:site,subject:'Original',preheader:'',body:'Local edited body',
  listUid:'list_one',draftUid:uid,requestUid:'',revision:2};
const remote={uid,subject:'Server subject changed',revision:4,body:'Remote private Markdown'};
test('canonical Email body parser prevents previously double-escaped whitespace bug',()=>{
  const text='---\nemail_subject: "Hello"\n---\n\n## Email body\n\nHello world';
  assert.equal(extractStandaloneEmailBody(text),'Hello world');
  assert.equal(extractStandaloneEmailBody(text.replaceAll('\n','\r\n')),'Hello world');
  assert.equal(extractStandaloneEmailBody('## Email body   \ncontent'),'content');
  assert.throws(()=>extractStandaloneEmailBody('## Email body\\s\ncontent'),/heading is missing/);
  assert.throws(()=>extractStandaloneEmailBody('## Email body-sent\ncontent'),/heading is missing/);
});
test('source integration uses one canonical body extractor in ALL private Draft paths',async()=>{
  const fs=await import('node:fs/promises');
  const main=await fs.readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  assert(!main.includes('Email body\\\\s'),'double escaped whitespace must never reappear');
  assert(!main.includes('Email body\\s*$/im.exec('),'do not bypass single body parser');
  assert(main.includes('extractStandaloneEmailBody(currentRaw)'));
  assert(main.includes('extractStandaloneEmailBody(raw)'));
});
test('manual revision-only adoption requires genuinely newer matching server revision',()=>{
  assert.equal(verifyManualConflictAdoption(plan,remote,{...remote}),4);
  assert.throws(()=>verifyManualConflictAdoption({...plan,revision:4},remote,remote),/newer/);
  assert.throws(()=>verifyManualConflictAdoption({...plan,draftUid:''},remote,remote),/verified/);
  assert.throws(()=>verifyManualConflictAdoption(plan,{...remote,uid:'33333333-3333-4333-8333-333333333333'},remote),/verified/);
});
test('same revision but changed server subject/body is rejected',()=>{
  assert.throws(()=>verifyManualConflictAdoption(plan,remote,{...remote,body:'new third-party body'}),/changed since conflict/);
  assert.throws(()=>verifyManualConflictAdoption(plan,remote,{...remote,subject:'new subject'}),/changed since conflict/);
  assert.throws(()=>verifyManualConflictAdoption(plan,remote,{...remote,revision:5}),/changed since conflict/);
});
test('local saved badge must not remain after remote revision-only adoption',()=>{
  const local='---\nstatus: draft\n---\n'+
    '> [!success] Saved on HakiSend · Private Draft · Revision 2 — NOT sent\n'+
    '## Email body\n\nSensitive LOCAL text';
  const output=markManualConflictPending(local,4);
  assert(output.includes('Manual conflict review · Remote base revision 4'));
  assert(!output.includes('[!success] Saved on HakiSend'));
  assert(output.includes('Sensitive LOCAL text'));
  assert.equal(markManualConflictPending(output,4),output);
  assert(markManualConflictPending(output,5).includes('Remote base revision 5'));
});
test('never change a custom author callout or body when updating conflict marker',()=>{
  const user='> [!warning] My private notes\n## Email body\nA local-only body';
  assert.equal(markManualConflictPending(user,3),user);
  assert.throws(()=>markManualConflictPending(user,0),/Invalid/);
});
