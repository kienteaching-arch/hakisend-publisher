import test from 'node:test';
import assert from 'node:assert/strict';
import {knownPendingR3Receipts} from '../src/email/r3-pending-recovery.ts';
const site='75422363-ddb9-4b2d-ae7f-9f65090d7407';
const other='75422363-ddb9-4b2d-ae7f-9f65090d7408';
const campaign='aabbcc1122334';
const req='123e4567-e89b-42d3-a456-426614174000';
const valid={siteUid:site,campaignUid:campaign,requestUid:req,action:'send_now'};
test('No pending records is a safe no-op',()=>{
 assert.deepEqual(knownPendingR3Receipts(undefined,[{uid:site}]),{intents:[],ignored:0});
});
test('Receipt discoverable after native Campaign no longer NEW',()=>{
 const raw={[site+':'+campaign]:valid};
 const list=knownPendingR3Receipts(raw,[{uid:site}]);
 assert.equal(list.intents.length,1);
 assert.deepEqual(list.intents[0],valid);
});
test('Cross-Site persistent intents never appear on unowned Site',()=>{
 assert.equal(knownPendingR3Receipts({[site+':'+campaign]:valid},[{uid:other}]).intents.length,0);
});
test('Storage key mismatch fails closed',()=>{
 assert.equal(knownPendingR3Receipts({['WRONG:'+campaign]:valid},[{uid:site}]).ignored,1);
});
test('Invalid request identifiers fail closed',()=>{
 assert.equal(knownPendingR3Receipts({[site+':'+campaign]:{...valid,requestUid:'bad'}},[{uid:site}]).ignored,1);
});
test('Unsupported action is not recovered',()=>{
 assert.equal(knownPendingR3Receipts({[site+':'+campaign]:{...valid,action:'send_always'}},[{uid:site}]).ignored,1);
});
test('Malformed local persistence never unlocks a POST',()=>{
 assert.throws(()=>knownPendingR3Receipts(['not a map'],[{uid:site}]));
});
test('Stored two actions display deterministic Campaign order without auto-changing any intent',()=>{
 const a={...valid,action:'schedule',campaignUid:'0000000000001'};
 const rows=knownPendingR3Receipts({[site+':'+campaign]:valid,[site+':'+a.campaignUid]:a},[{uid:site}]);
 assert.deepEqual(rows.intents.map(x=>x.campaignUid),[a.campaignUid,campaign]);
 assert.equal(rows.ignored,0);
});
