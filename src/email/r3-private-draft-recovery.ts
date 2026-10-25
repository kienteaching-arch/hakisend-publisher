/**
 * Lost-response recovery for a Private Draft created by an earlier POST.
 * This module only validates GET responses; caller must never POST/retry.
 * Server GET index is owner/Site scoped and returns at most 50 records.
 */
import type {StandalonePlan} from './private-draft-contract.ts';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export interface RecoveredDraft{uid:string;revision:number;}
export function locateDraftForRecovery(rows:unknown,plan:StandalonePlan):string {
 if(!plan.requestUid||!UUID.test(plan.requestUid)||plan.draftUid)
  throw Error('Only a persisted, unresolved Private Draft request may be recovered.');
 if(!Array.isArray(rows)||rows.length>50)
  throw Error('Unbounded or untrusted Draft index. Do not retry POST.');
 const matches=rows.filter(row=>obj(row)&&row.request_uid===plan.requestUid);
 if(matches.length!==1)throw Error('The request UID is not uniquely discoverable. Manual reconciliation required; do not retry POST.');
 const row=matches[0] as Record<string,unknown>;
 if(typeof row.uid!=='string'||!UUID.test(row.uid)||
  row.status!=='private_draft'||row.send_enabled!==false||
  row.scheduled!==false||row.acelle_campaign_uid!==null||
  row.list_uid!==plan.listUid||row.subject!==plan.subject||
  (row.preheader??'')!==plan.preheader||
  !Number.isSafeInteger(row.revision)||(row.revision as number)<1)
  throw Error('Draft summary does not match local Email Only source.');
 return row.uid.toLowerCase();
}
export function verifyRecoveredPrivateDraft(
 raw:unknown,plan:StandalonePlan,uid:string
):RecoveredDraft {
 if(!obj(raw)||!UUID.test(uid)||raw.uid!==uid||raw.request_uid!==plan.requestUid||
  raw.list_uid!==plan.listUid||raw.subject!==plan.subject||
  (raw.preheader??'')!==plan.preheader||
  raw.body_markdown!==plan.body||raw.status!=='private_draft'||
  raw.send_enabled!==false||raw.scheduled!==false||
  raw.acelle_campaign_uid!==null||
  !Number.isSafeInteger(raw.revision)||(raw.revision as number)<1)
  throw Error('Private Draft detail is not an exact body/list/request match.');
 return {uid,revision:raw.revision as number};
}
