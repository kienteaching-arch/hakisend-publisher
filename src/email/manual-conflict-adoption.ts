/**
 * Conflict revision adoption for owner-reviewed Standalone Email Drafts.
 *
 * This is local metadata reconciliation ONLY. It does not create/PUT a
 * Campaign, silently select winning content, or synchronize a Markdown body.
 * The next separate explicit Save uses a new CAS base.
 */
import {canAdoptRevision, type StandalonePlan} from './private-draft-contract.ts';
import {type PrivateDraftReadOnlyDetail} from './private-draft-list.ts';

export function verifyManualConflictAdoption(
  plan:StandalonePlan,
  displayed:PrivateDraftReadOnlyDetail,
  fresh:PrivateDraftReadOnlyDetail,
):number {
  if (!plan.draftUid || !Number.isSafeInteger(plan.revision) ||
      (plan.revision??0)<1 ||
      !canAdoptRevision(plan.draftUid,plan.revision??0,{
        uid:displayed.uid,revision:displayed.revision,
        status:'private_draft',send_enabled:false,subject:displayed.subject,
      },displayed.revision)) {
    throw Error('A verified, newer server Draft revision is required.');
  }
  // A server administrator/import race can change content without incrementing
  // revision. Reject this despite the exact same revision number: the author
  // must see the NEW server body/subject before any metadata adoption.
  if (fresh.uid.toLowerCase()!==displayed.uid.toLowerCase() ||
      fresh.revision!==displayed.revision ||
      fresh.subject!==displayed.subject ||
      fresh.body!==displayed.body) {
    throw Error('Remote Draft changed since conflict review. Reload both versions.');
  }
  if (!Number.isSafeInteger(fresh.revision) ||
      fresh.revision<1)throw Error('Invalid remote Draft revision.');
  return fresh.revision;
}

/**
 * A local note previously marked "Saved" cannot retain that claim after
 * adopting a newer remote base without actually PUTting its own content.
 * Only our generated callout changes, never an author's custom callout/body.
 */
export function markManualConflictPending(
  markdown:string,remoteRevision:number,
):string {
  if(!Number.isSafeInteger(remoteRevision)||remoteRevision<1)
    throw Error('Invalid conflict revision.');
  const pending='> [!warning] Manual conflict review · Remote base revision '+
    remoteRevision+' · Local changes NOT saved to HakiSend';
  const previous=/^> \[!success\] Saved on HakiSend · Private Draft · Revision [1-9]\d* — NOT sent$/m;
  const oldPending=/^> \[!warning\] Manual conflict review · Remote base revision [1-9]\d* · Local changes NOT saved to HakiSend$/m;
  if(previous.test(markdown))return markdown.replace(previous,pending);
  if(oldPending.test(markdown))return markdown.replace(oldPending,pending);
  return markdown;
}
