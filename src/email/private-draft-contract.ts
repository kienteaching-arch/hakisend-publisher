/**
 * Pure, side-effect-free v0.1.9 Private Draft contract.
 * Ported from owner-tested source/private-draft-management.cjs.
 * NOT a new API route, sender, scheduler, or publishing integration.
 */
const UUID = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
const LIST_UID = /^[A-Za-z0-9_.:\-]{3,191}$/;
const ROOT = 'HakiSend Emails/';
const encoder = new TextEncoder();

export interface NoteRef { path: string; extension: string; }
export interface PlanFields { [key: string]: unknown; }
export interface StandalonePlan {
  siteUid: string;
  subject: string;
  preheader: string;
  body: string;
  listUid: string;
  draftUid: string;
  requestUid: string;
  revision: number | undefined;
}
export interface Audience { uid: string; name: string; }
export interface PrivateDraft {
  uid: string;
  revision: number;
  status: 'private_draft';
  send_enabled: false;
  subject: string;
  body_markdown?: string;
  request_uid?: string;
}
export interface Mutation {
  method: 'POST' | 'PUT';
  suffix: string;
  payload: {
    request_uid?: string;
    list_uid?: string;
    revision?: number;
    subject: string;
    preheader: string;
    body_markdown: string;
  };
}
function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function byteLength(value: string): number { return encoder.encode(value).length; }

export function parseStandalonePlan(file: NoteRef, fields: PlanFields, markdown: string): StandalonePlan {
  if (!file || typeof file.path !== 'string' || !file.path.startsWith(ROOT) || file.extension !== 'md') {
    throw Error('Open an Email Plan in the HakiSend Emails folder.');
  }
  if (fields.hakisend_type !== 'email_campaign' || fields.hakisend_email_kind !== 'standalone') {
    throw Error('Only Standalone Email Plans can use this private Draft API. Post-linked emails remain local.');
  }
  if (fields.hakisend_import_snapshot === true || fields.hakisend_read_only === true) {
    throw Error('Read-only imported notes cannot be used for writing.');
  }
  if (!validUuid(fields.site_uid)) throw Error('Invalid Site UID');
  const subject = fields.email_subject;
  if (typeof subject !== 'string' || !subject.trim() || byteLength(subject) > 255) {
    throw Error('Email subject is missing or too long.');
  }
  const preheader = fields.email_preheader == null ? '' : fields.email_preheader;
  if (typeof preheader !== 'string' || byteLength(preheader) > 255) throw Error('Invalid preheader.');
  const marker = /^## Email body\s*$/im.exec(markdown);
  if (!marker) throw Error('Email body heading is missing. Create a local Standalone Email Plan first.');
  const body = markdown.slice(marker.index + marker[0].length).trim();
  if (!body || body.includes('Write the standalone email here.') || byteLength(body) > 200000 || body.includes('\0')) {
    throw Error('Replace the placeholder under "## Email body" with actual Markdown before saving.');
  }
  const draftUid = fields.hakisend_remote_email_draft_uid || '';
  const requestUid = fields.hakisend_remote_email_request_uid || '';
  const revision = fields.hakisend_remote_email_revision;
  if (draftUid !== '' && !validUuid(draftUid)) throw Error('Invalid saved remote Draft UID.');
  if (requestUid !== '' && !validUuid(requestUid)) throw Error('Invalid saved request UID.');
  if (draftUid && (!Number.isInteger(revision) || (revision as number) < 1)) {
    throw Error('Remote Draft revision is missing. Open the remote Draft for recovery.');
  }
  const listUid = fields.email_list_uid || '';
  if (typeof listUid !== 'string') throw Error('Invalid Email audience.');
  return {
    siteUid: fields.site_uid.toLowerCase(), subject: subject.trim(), preheader, body,
    listUid, draftUid: draftUid as string, requestUid: requestUid as string,
    revision: typeof revision === 'number' ? revision : undefined,
  };
}

export function isAudience(value: unknown): value is Audience {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.uid === 'string' && LIST_UID.test(item.uid) && typeof item.name === 'string';
}

export function createDraftMutation(plan: StandalonePlan, authorized: readonly Audience[], selectedListUid: string): Mutation {
  if (!LIST_UID.test(selectedListUid) || !authorized.some(a => isAudience(a) && a.uid === selectedListUid)) {
    throw Error('The audience is no longer enabled for this Site.');
  }
  if (plan.listUid && plan.listUid !== selectedListUid) {
    throw Error('Saved/requested Draft audience cannot change.');
  }
  if (plan.draftUid) {
    if (!validUuid(plan.draftUid) || !Number.isInteger(plan.revision) || (plan.revision ?? 0) < 1) {
      throw Error('Cannot update a Draft without its exact server revision.');
    }
    return {
      method: 'PUT', suffix: `drafts/${plan.draftUid.toLowerCase()}`,
      payload: { revision: plan.revision, subject: plan.subject, preheader: plan.preheader, body_markdown: plan.body },
    };
  }
  // Caller must save request_uid to the note BEFORE POST; never regenerate on ambiguous response.
  if (!validUuid(plan.requestUid)) throw Error('Persist a stable request UID before creating a private Draft.');
  return {
    method: 'POST', suffix: 'drafts',
    payload: {
      request_uid: plan.requestUid.toLowerCase(), list_uid: selectedListUid,
      subject: plan.subject, preheader: plan.preheader, body_markdown: plan.body,
    },
  };
}

export function validDraftSummary(value: unknown): value is PrivateDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return validUuid(draft.uid) && typeof draft.subject === 'string' &&
    Number.isInteger(draft.revision) && (draft.revision as number) >= 1 &&
    draft.status === 'private_draft' && draft.send_enabled === false;
}

export function verifyDraftReadback(plan: StandalonePlan, mutationResult: unknown, readback: unknown): PrivateDraft {
  if (!validDraftSummary(mutationResult) || !validDraftSummary(readback)) {
    throw Error('Remote private Draft status is not verified; do not retry automatically.');
  }
  if (mutationResult.uid !== readback.uid || mutationResult.revision !== readback.revision ||
      readback.subject !== plan.subject || readback.body_markdown !== plan.body) {
    throw Error('Draft saved but readback differs; inspect remote before retrying.');
  }
  if (plan.draftUid && readback.uid.toLowerCase() !== plan.draftUid.toLowerCase()) {
    throw Error('Remote Draft UID changed unexpectedly.');
  }
  if (plan.draftUid && readback.revision !== (plan.revision ?? 0) + 1) {
    throw Error('Remote Draft revision increment mismatch.');
  }
  if (!plan.draftUid && (readback.revision !== 1 || readback.request_uid !== plan.requestUid)) {
    throw Error('Created Draft identity or revision mismatch; do not retry.');
  }
  return readback;
}

export function verifiedCallout(revision: number): string {
  if (!Number.isInteger(revision) || revision < 1) throw Error('Invalid remote revision.');
  return `> [!success] Saved on HakiSend · Private Draft · Revision ${revision} — NOT sent`;
}

export function decorateLocalPlan(markdown: string, revision: number): string {
  const replacement = verifiedCallout(revision);
  const original = '> [!warning] Email plan — local draft, NOT sent or scheduled on HakiSend';
  const previous = /^> \[!success\] Saved on HakiSend · Private Draft · Revision [1-9]\d* — NOT sent$/m;
  if (markdown.includes(original)) return markdown.replace(original, replacement);
  if (previous.test(markdown)) return markdown.replace(previous, replacement);
  return markdown;
}

export function isRevisionConflict(value: unknown): boolean {
  return value instanceof Error && /revision_conflict/.test(value.message) && /\b409\b/.test(value.message);
}

export function canAdoptRevision(localUid: string, localRevision: number, remote: unknown, expectedRemoteRevision: number): boolean {
  return validUuid(localUid) && Number.isInteger(localRevision) && localRevision >= 1 &&
    validDraftSummary(remote) && remote.uid.toLowerCase() === localUid.toLowerCase() &&
    remote.revision === expectedRemoteRevision && remote.revision > localRevision;
}
