/**
 * Phase 3A CANDIDATE — explicit bidirectional Markdown sync decision engine.
 *
 * Pure preview planner. It does not read a vault, write a file, call an API,
 * upload Markdown, or automatically resolve conflicts.
 *
 * IMPORTANT: 'review_push' is NOT authorization to write. A future executor
 * must obtain explicit approval, re-read the remote state_token, and use
 * server-enforced compare-and-swap in the same DB transaction as the update.
 */

export type SyncIntent =
  | {kind: 'sync_all'; confirmedByUser: true}
  | {kind: 'selected'; confirmedByUser: true; postKeys: readonly string[]};

export type SyncAction =
  | 'no_change'
  | 'review_import'
  | 'review_pull'
  | 'review_push'
  | 'review_initial_pair'
  | 'conflict'
  | 'blocked';

export interface MarkdownSyncPair {
  siteUid: string;
  postUid: string;
  localPath: string | null;
  localSha256: string | null;
  remoteSha256: string | null;
  remoteStateToken: string | null;
  baseLocalSha256: string | null;
  baseRemoteStateToken: string | null;
  remoteEditableMarkdown: boolean;
  serverCasSupported: boolean;
  localDeleted?: boolean;
  remoteDeleted?: boolean;
}

export interface SyncPlanLine {
  key: string;
  action: SyncAction;
  reason: string;
  requiresConfirmation: boolean;
  createsConflictCopy: boolean;
  // For a future uploader, never substitute a baseline token for this
  // actual currently-observed, server-confirmed CAS precondition.
  expectedRemoteToken: string | null;
}

const SHA = /^[a-f0-9]{64}$/i;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const INVALID_PATH_SEGMENT = /(^|\/|\\)\.{1,2}(\/|\\|$)/;
const keyFor = (pair: Pick<MarkdownSyncPair, 'siteUid' | 'postUid'>): string =>
  pair.siteUid + ':' + pair.postUid;

function safePath(path: string | null): boolean {
  return path === null || (path.length > 0 && path.length <= 1024 &&
    !path.startsWith('/') && !path.startsWith('\\') &&
    !/^[a-zA-Z]:/.test(path) && !INVALID_PATH_SEGMENT.test(path) &&
    !/[\0\r\n]/.test(path));
}
function shaOrEmpty(value: string | null): boolean {
  return value === null || SHA.test(value);
}
function result(pair: MarkdownSyncPair, action: SyncAction, reason: string): SyncPlanLine {
  return {
    key: keyFor(pair), action, reason,
    requiresConfirmation: action !== 'no_change' && action !== 'blocked',
    createsConflictCopy: action === 'conflict',
    expectedRemoteToken: action === 'review_push' ? pair.remoteStateToken : null,
  };
}

export function planManualMarkdownSync(
  records: readonly MarkdownSyncPair[],
  intent: SyncIntent,
): SyncPlanLine[] {
  if (!intent || intent.confirmedByUser !== true ||
      (intent.kind !== 'sync_all' && intent.kind !== 'selected')) {
    throw Error('Sync requires a current explicit user action.');
  }
  const keys = new Set<string>();
  const paths = new Set<string>();
  for (const record of records) {
    if (!ID.test(record.siteUid) || !ID.test(record.postUid)) {
      throw Error('Untrusted or missing Site/Post identity.');
    }
    const key = keyFor(record);
    if (keys.has(key)) throw Error('Duplicate remote Post identity in Sync plan.');
    keys.add(key);
    if (!safePath(record.localPath)) throw Error('Unsafe local note path.');
    if (record.localPath !== null) {
      const pathKey = record.localPath.normalize('NFC').toLocaleLowerCase('en-US');
      if (paths.has(pathKey)) throw Error('Multiple remote Posts map to the same local file.');
      paths.add(pathKey);
    }
    for (const h of [
      record.localSha256, record.remoteSha256, record.remoteStateToken,
      record.baseLocalSha256, record.baseRemoteStateToken,
    ]) {
      if (!shaOrEmpty(h)) throw Error('Invalid source or revision checksum.');
    }
  }
  let included: readonly MarkdownSyncPair[] = records;
  if (intent.kind === 'selected') {
    if (intent.postKeys.length === 0) throw Error('Choose at least one Post.');
    const selection = new Set(intent.postKeys);
    if (selection.size !== intent.postKeys.length) throw Error('Duplicate selected Post.');
    if ([...selection].some(key => !keys.has(key))) throw Error('Selected Post not found.');
    included = records.filter(record => selection.has(keyFor(record)));
  }

  return included.map(record => {
    if (record.localDeleted || record.remoteDeleted) {
      return result(record, 'blocked', 'DELETION_NEEDS_EXPLICIT_SEPARATE_REVIEW');
    }
    if (!record.remoteEditableMarkdown || record.remoteSha256 === null ||
        record.remoteStateToken === null) {
      return result(record, 'blocked', 'SERVER_MARKDOWN_SOURCE_NOT_ROUNDTRIP_SAFE');
    }
    if (record.localPath === null || record.localSha256 === null) {
      return result(record, 'review_import', 'REMOTE_ONLY_READONLY_PROPOSAL');
    }
    if (record.baseLocalSha256 === null || record.baseRemoteStateToken === null) {
      return result(record, 'review_initial_pair', 'NO_TRUSTED_LAST_SYNC_BASELINE');
    }

    const localChanged = record.localSha256 !== record.baseLocalSha256;
    const remoteChanged = record.remoteStateToken !== record.baseRemoteStateToken;
    if (localChanged && remoteChanged) {
      return result(record, 'conflict', 'BOTH_LOCAL_AND_REMOTE_CHANGED_KEEP_BOTH');
    }
    if (remoteChanged) {
      return result(record, 'review_pull', 'REMOTE_CHANGED_KEEP_LOCAL_BACKUP_AND_REQUIRE_APPROVAL');
    }
    if (localChanged) {
      if (!record.serverCasSupported) {
        return result(record, 'blocked', 'SERVER_ATOMIC_CAS_ENDPOINT_NOT_VERIFIED');
      }
      return result(record, 'review_push', 'LOCAL_CHANGED_REQUIRE_FRESH_SERVER_CAS_AND_APPROVAL');
    }
    return result(record, 'no_change', 'MATCHES_ACCEPTED_BASELINE');
  });
}
