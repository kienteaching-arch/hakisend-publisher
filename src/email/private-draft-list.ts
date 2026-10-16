/**
 * A read-only adapter for the existing Sites EmailDraftApiController#index.
 * The endpoint returns at most 50 owner-scoped records with no cursor.
 * Do not infer completeness, send status, or original Markdown beyond the
 * exact server-owned draft metadata.
 */
export interface PrivateDraftListRow {
  uid: string;
  subject: string;
  revision: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function parsePrivateDraftList(data: unknown): PrivateDraftListRow[] {
  if (!Array.isArray(data) || data.length > 50) {
    throw Error('Unexpected or unbounded private Email list.');
  }
  const result: PrivateDraftListRow[] = [];
  const seen = new Set<string>();
  for (const raw of data) {
    if (!object(raw) || typeof raw.uid !== 'string' || !UUID.test(raw.uid)
        || typeof raw.subject !== 'string' || !raw.subject.trim()
        || raw.subject.length > 255 || /[\0\r\n]/.test(raw.subject)
        || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1
        || raw.status !== 'private_draft' || raw.send_enabled !== false
        || raw.scheduled !== false || raw.acelle_campaign_uid !== null
        || 'body_markdown' in raw) {
      throw Error('Unverified private Email summary.');
    }
    const id = raw.uid.toLowerCase();
    if (seen.has(id)) throw Error('Duplicate private Email identity.');
    seen.add(id);
    result.push({uid:id,subject:raw.subject,revision:raw.revision as number});
  }
  return result;
}

/** Verified on-demand GET detail. NEVER interpret body as HTML or a send payload. */
export interface PrivateDraftReadOnlyDetail extends PrivateDraftListRow {
  body: string;
}
export function parsePrivateDraftDetail(data: unknown, expectedUid: string): PrivateDraftReadOnlyDetail {
  if (!UUID.test(expectedUid) || !object(data)
      || data.uid !== expectedUid
      || data.status !== 'private_draft'
      || data.send_enabled !== false || data.scheduled !== false
      || data.acelle_campaign_uid !== null
      || typeof data.subject !== 'string' || !data.subject.trim()
      || data.subject.length > 255 || /[\0\r\n]/.test(data.subject)
      || !Number.isSafeInteger(data.revision) || (data.revision as number) < 1
      || typeof data.body_markdown !== 'string'
      || data.body_markdown.length > 200_000 || data.body_markdown.includes('\0')) {
    throw Error('Unverified or mismatched private Email detail.');
  }
  return {
    uid:expectedUid,
    subject:data.subject,
    revision:data.revision as number,
    body:data.body_markdown,
  };
}
