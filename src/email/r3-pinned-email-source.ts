/**
 * R3 Email Only: fail-closed source attestation before sending a pinned Campaign.
 *
 * The plan can be edited AFTER an Acelle Campaign has been created. Checking
 * only campaign_uid would send the OLD remote body while showing the NEW local
 * body. For EVERY delivery approval, GET current Sites Private Draft and
 * GET its exact Publisher promotion receipt. Both must match the complete
 * local Markdown and stored identities. Neither GET authorizes delivery.
 *
 * No POST, list mutation, template upload or email delivery is performed here.
 */
import type {StandalonePlan} from './private-draft-contract.ts';
import {validatePromotionReceipt} from './private-draft-promotion.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACELLE=/^[0-9a-f]{13}$/i;
const object=(x:unknown):x is Record<string,unknown> =>
  x!==null&&typeof x==='object'&&!Array.isArray(x);

export interface PinnedEmailSnapshot {
 readonly campaignUid:string;
 readonly siteUid:string;
 readonly draftUid:string;
 readonly draftRevision:number;
 readonly promotionRequestUid:string;
 readonly subject:string;
 readonly listUid:string;
 readonly body:string;
 readonly preheader:string;
}
export function verifyPinnedEmailSource(
  plan:StandalonePlan,
  campaignUid:unknown,
  promotionRequestUid:unknown,
  remoteDraft:unknown,
  remotePromotionReceipt:unknown,
):PinnedEmailSnapshot {
 if(!plan||typeof plan.siteUid!=='string'||!UUID.test(plan.siteUid)||
   !UUID.test(plan.draftUid)||!UUID.test(plan.requestUid)||
   !Number.isSafeInteger(plan.revision)||(plan.revision??0)<1||
   typeof plan.listUid!=='string'||!plan.listUid||
   typeof plan.subject!=='string'||!plan.subject.trim()||
   typeof plan.body!=='string'||!plan.body.trim()||
   typeof promotionRequestUid!=='string'||!UUID.test(promotionRequestUid)||
   typeof campaignUid!=='string'||!ACELLE.test(campaignUid))
   throw Error('Pinned email has missing verified local identities.');
 if(!object(remoteDraft)||
   remoteDraft.uid!==plan.draftUid||
   remoteDraft.request_uid!==plan.requestUid||
   remoteDraft.list_uid!==plan.listUid||
   remoteDraft.revision!==plan.revision||
   remoteDraft.subject!==plan.subject||
   (remoteDraft.preheader??'')!==plan.preheader||
   remoteDraft.body_markdown!==plan.body||
   remoteDraft.status!=='private_draft'||
   remoteDraft.send_enabled!==false||
   remoteDraft.scheduled!==false||
   remoteDraft.acelle_campaign_uid!==null)
   throw Error('Email was edited or remote Draft differs. Re-save and review before any send.');
 const receipt=validatePromotionReceipt(remotePromotionReceipt,plan.draftUid,
   promotionRequestUid);
 if(receipt.campaign_uid!==campaignUid)
   throw Error('Native Acelle Campaign no longer matches this Email Only plan.');
 return {
   campaignUid,siteUid:plan.siteUid,draftUid:plan.draftUid,
   draftRevision:plan.revision!,promotionRequestUid,
   subject:plan.subject,listUid:plan.listUid,body:plan.body,
   preheader:plan.preheader,
 };
}
