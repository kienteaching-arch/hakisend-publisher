import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitlySavePrivateDraft} from '../src/email/explicit-private-draft-save.ts';
const SITE='11111111-1111-4111-8111-111111111111';
const REQUEST='22222222-2222-4222-8222-222222222222';
const DRAFT='33333333-3333-4333-8333-333333333333';
const BASE={
  siteUid:SITE,subject:'Subject',preheader:'Intro',body:'Hello markdown',
  listUid:'list_one',draftUid:'',requestUid:'',revision:undefined
};
const audiences=[{uid:'list_one',name:'One'}];
const serverDraft=(revision=1)=>({
  uid:DRAFT,revision,request_uid:REQUEST,status:'private_draft',send_enabled:false,
  scheduled:false,acelle_campaign_uid:null,subject:'Subject',body_markdown:'Hello markdown'
});
function harness({draft=serverDraft(),before={},onMutate}={}){
  const order=[];
  let mutateCount=0;
  return {
    order,
    get mutateCount(){return mutateCount},
    io:{
      async persistCreateIdentity(uid,audience){
        order.push('persist-create');
        assert.equal(uid,REQUEST); assert.equal(audience,'list_one');
        if(before.persist) throw Error('Disk failed');
      },
      async getRemoteDraft(uid){
        order.push('GET');
        assert.equal(uid,DRAFT);
        return draft;
      },
      async mutateRemote(mutation){
        order.push(mutation.method);
        mutateCount++;
        assert(!('send' in mutation.payload));
        assert(!('run_at' in mutation.payload));
        if(onMutate) return onMutate(mutation);
        return draft;
      },
      async persistVerifiedReceipt(result){
        order.push('persist-receipt');
        assert.equal(result.uid,DRAFT);
        if(before.receipt) throw Error('Local note moved');
      }
    }
  };
}
test('new draft persists stable request_uid before POST, then GET, then local receipt',async()=>{
  const h=harness();
  const result=await explicitlySavePrivateDraft({
    plan:BASE,selectedAudienceUid:'list_one',authorizedAudiences:audiences,
    newRequestUid:REQUEST,io:h.io
  });
  assert.equal(result.uid,DRAFT);
  assert.deepEqual(h.order,['persist-create','POST','GET','persist-receipt']);
  assert.equal(h.mutateCount,1);
});
test('existing ambiguous create reuses exactly same request UID (never regenerate)',async()=>{
  const h=harness();
  await explicitlySavePrivateDraft({
    plan:{...BASE,requestUid:REQUEST},selectedAudienceUid:'list_one',
    authorizedAudiences:audiences,io:h.io
  });
  assert.deepEqual(h.order,['persist-create','POST','GET','persist-receipt']);
});
test('failed local UID persistence forbids remote POST',async()=>{
  const h=harness({before:{persist:true}});
  await assert.rejects(()=>explicitlySavePrivateDraft({
    plan:BASE,selectedAudienceUid:'list_one',authorizedAudiences:audiences,
    newRequestUid:REQUEST,io:h.io
  }),/Disk failed/);
  assert.equal(h.mutateCount,0);
});
test('revoked audience forbids local identity persistence or remote POST',async()=>{
  const h=harness();
  await assert.rejects(()=>explicitlySavePrivateDraft({
    plan:BASE,selectedAudienceUid:'revoked',authorizedAudiences:audiences,
    newRequestUid:REQUEST,io:h.io
  }),/no longer enabled/);
  assert.deepEqual(h.order,[]);
});
test('missing UID or invalid entropy source forbids first POST',async()=>{
  const h=harness();
  await assert.rejects(()=>explicitlySavePrivateDraft({
    plan:BASE,selectedAudienceUid:'list_one',authorizedAudiences:audiences,
    newRequestUid:'weak',io:h.io
  }),/Cryptographic/);
  assert.deepEqual(h.order,[]);
});
test('PUT does current revision GET before writing, then verified GET after',async()=>{
  const h=harness({draft:serverDraft(3)});
  const result=await explicitlySavePrivateDraft({
    plan:{...BASE,draftUid:DRAFT,revision:3,requestUid:REQUEST},
    selectedAudienceUid:'list_one',authorizedAudiences:audiences,
    io:{
      ...h.io,
      mutateRemote:async mutation=>{
        h.order.push(mutation.method);
        assert.equal(mutation.payload.revision,3);
        h.io.getRemoteDraft=async uid=>{
          h.order.push('GET');
          assert.equal(uid,DRAFT);return serverDraft(4);
        };
        return serverDraft(4);
      }
    }
  });
  assert.equal(result.revision,4);
  assert.deepEqual(h.order,['GET','PUT','GET','persist-receipt']);
});
test('stale remote revision blocks PUT',async()=>{
  const h=harness({draft:serverDraft(4)});
  await assert.rejects(()=>explicitlySavePrivateDraft({
    plan:{...BASE,draftUid:DRAFT,revision:3,requestUid:REQUEST},
    selectedAudienceUid:'list_one',authorizedAudiences:audiences,io:h.io
  }),/revision changed/);
  assert.deepEqual(h.order,['GET']);
});
test('ambiguous failed POST never claims saved status or retries',async()=>{
  const h=harness({onMutate:()=>{throw Error('network timeout')}});
  await assert.rejects(()=>explicitlySavePrivateDraft({
    plan:BASE,selectedAudienceUid:'list_one',authorizedAudiences:audiences,
    newRequestUid:REQUEST,io:h.io
  }),/network timeout/);
  assert.deepEqual(h.order,['persist-create','POST']);
  assert.equal(h.mutateCount,1);
});
test('mismatched fresh server readback cannot claim locally saved',async()=>{
  const h=harness({draft:{...serverDraft(),body_markdown:'Changed on server'}});
  await assert.rejects(()=>explicitlySavePrivateDraft({
    plan:BASE,selectedAudienceUid:'list_one',authorizedAudiences:audiences,
    newRequestUid:REQUEST,io:h.io
  }),/readback differs/);
  assert.deepEqual(h.order,['persist-create','POST','GET']);
});
test('local note revision change after success does not cause remote resend',async()=>{
  const h=harness({before:{receipt:true}});
  await assert.rejects(()=>explicitlySavePrivateDraft({
    plan:BASE,selectedAudienceUid:'list_one',authorizedAudiences:audiences,
    newRequestUid:REQUEST,io:h.io
  }),/Local note moved/);
  assert.deepEqual(h.order,['persist-create','POST','GET','persist-receipt']);
  assert.equal(h.mutateCount,1);
});
