import test from 'node:test';
import assert from 'node:assert/strict';
import {createR3LocalPlan,renderR3LocalPlan} from '../src/multichannel/r3-distribution-contract.ts';
import {r3LocalCalendar,readR3LocalPlanNote} from '../src/multichannel/r3-local-calendar.ts';
const site='75422363-ddb9-4b2d-ae7f-9f65090d7407';
const other='75422363-ddb9-4b2d-ae7f-9f65090d7408';
const now=new Date('2026-10-25T00:00:00Z');
function make(id,kind,at){
 return createR3LocalPlan({mode:kind,siteUid:id,notePath:kind==='post'?'Articles/a.md':'Emails/a.md',
 title:'One title',
 markdown:kind==='post'?'<!-- hakisend:free:start -->\nPublic\n<!-- hakisend:free:end -->\nPremium secret':'Standalone full email',
 postScheduledAt:kind==='post'?at:undefined,
 lists:[{listUid:'list-one',templateRef:'email-template',subject:'Newsletter',scheduledAt:at}],
 pages:kind==='post'?[{pageId:'1234567890',pageName:'Kiên Parenting Page',scheduledAt:at}]:[]
 },now);
}
test('All Sites includes real Site labels and Facebook Page identities',()=>{
 const docs=[
 {path:'HakiSend Distribution Plans/'+site+'/a.md',markdown:renderR3LocalPlan(make(site,'post','2026-11-01T09:00:00+07:00'))},
 {path:'HakiSend Distribution Plans/'+other+'/b.md',markdown:renderR3LocalPlan(make(other,'email_only','2026-11-02T10:00:00+07:00'))}
 ];
 const view=r3LocalCalendar(docs);
 assert.deepEqual(view.entries.map(x=>x.kind),
 ['site_post','post_free_email','facebook_page_post','standalone_email']);
 assert.equal(view.entries[2].destinationLabel,'Kiên Parenting Page');
 assert.equal(view.entries[0].siteUid,site);
 assert.equal(view.entries[3].siteUid,other);
 assert(view.entries.every(x=>x.status==='local_draft'));
 assert.equal(view.invalidDocuments,0);
});
test('Single Site and type filters are precise',()=>{
 const docs=[
 {path:'HakiSend Distribution Plans/'+site+'/a.md',markdown:renderR3LocalPlan(make(site,'post','2026-11-01T09:00:00+07:00'))},
 {path:'HakiSend Distribution Plans/'+other+'/b.md',markdown:renderR3LocalPlan(make(other,'email_only','2026-11-02T10:00:00+07:00'))}
 ];
 const fb=r3LocalCalendar(docs,site,'facebook_page_post');
 assert.equal(fb.entries.length,1);
 assert.equal(fb.entries[0].destinationUid,'1234567890');
 assert.equal(r3LocalCalendar(docs,other,'facebook_page_post').entries.length,0);
});
test('Invalid or hostile local plan is not displayed as a real schedule',()=>{
 const plan=make(site,'post','2026-11-01T09:00:00+07:00');
 const a=renderR3LocalPlan(plan);
 assert.throws(()=>readR3LocalPlanNote(a.replace('"local_only"','"sent"')));
 assert.throws(()=>readR3LocalPlanNote(a.replace('"local_draft"','"scheduled"')));
 const view=r3LocalCalendar([
  {path:'HakiSend Distribution Plans/'+site+'/safe.md',markdown:a},
  {path:'HakiSend Distribution Plans/'+site+'/hostile.md',markdown:a.replace('"local_only"','"sent"')}
 ]);
 assert.equal(view.invalidDocuments,1);
 assert.equal(view.entries.length,3);
});
test('No timestamp remains visibly unscheduled in local Calendar',()=>{
 const plan=make(site,'post','2026-11-01T09:00:00+07:00');
 const extra=createR3LocalPlan({mode:'email_only',siteUid:site,notePath:'Emails/b.md',
 title:'Unscheduled letter',markdown:'Complete independent note',
 lists:[{listUid:'list-two',templateRef:'simple',subject:'Unscheduled'}],pages:[]},now);
 const view=r3LocalCalendar([
  {path:'HakiSend Distribution Plans/'+site+'/a.md',markdown:renderR3LocalPlan(plan)},
  {path:'HakiSend Distribution Plans/'+site+'/b.md',markdown:renderR3LocalPlan(extra)}
 ]);
 assert.equal(view.entries.at(-1).scheduledAtUtc,null);
});
