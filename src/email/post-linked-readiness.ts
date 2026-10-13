/**
 * Post-linked Email readiness is a PURE decision over authoritative server facts.
 * No API, HTML, Campaign creation, scheduling or sending is performed here.
 * The caller must re-read public projection / membership / permissions at dispatch time,
 * reserve the durable ledger, and pass the result through an authorized sending adapter.
 */
export type IntentStatus = 'absent' | 'reserved' | 'creating' | 'accepted' | 'sent' | 'ambiguous' | 'cancelled';

export interface TrustedPostFacts {
  source: 'hakisend_server';
  siteUid: string;
  postUid: string;
  postIsGuestVisible: boolean;
  siteDomainRoutable: boolean;
  // The site-publication snapshot itself does NOT prove guest visibility.
  postPublishAtUtcMs: number | null;
  postUnpublishAtUtcMs: number | null;
}
export interface TrustedEmailFacts {
  source: 'hakisend_server';
  listUid: string;
  enrollmentUid: string;
  enrollmentExplicit: boolean;
  audienceEnabled: boolean;
  listBelongsToCustomer: boolean;
  siteAndCustomerAuthorized: boolean;
  sendScopeGranted: boolean;
  senderVerified: boolean;
  unsubFooterValid: boolean;
  templateAuthorized: boolean;
  quotaAvailable: boolean;
  // A content composer must use the exact server-side guest slice produced by Membership.
  contentOrigin: 'verified_guest_render' | 'unverified';
  noPremiumContentVerified: boolean;
  contentPostUid: string;
}
export interface DispatchReadinessInput {
  post: TrustedPostFacts;
  email: TrustedEmailFacts;
  ledgerStatus: IntentStatus;
  nowUtcMs: number;
}
export type DispatchReadinessDecision =
  | { ready: false; reason: string }
  | { ready: true; intentKey: string; sendNotBeforeUtcMs: number };

const UID = /^[A-Za-z0-9_.:\-]{3,191}$/;
function trustedId(value: string): boolean { return typeof value === 'string' && UID.test(value); }
function block(reason: string): DispatchReadinessDecision { return { ready: false, reason }; }
export function evaluatePostLinkedEmail(input: DispatchReadinessInput): DispatchReadinessDecision {
  const { post, email, ledgerStatus, nowUtcMs } = input;
  if (post?.source !== 'hakisend_server' || email?.source !== 'hakisend_server') return block('UNTRUSTED_FACTS');
  if (![post.siteUid, post.postUid, email.listUid, email.enrollmentUid, email.contentPostUid].every(trustedId)) return block('INVALID_IDENTITY');
  if (post.postUid !== email.contentPostUid) return block('CONTENT_POST_MISMATCH');
  if (!Number.isSafeInteger(nowUtcMs) || nowUtcMs < 0) return block('INVALID_SERVER_CLOCK');
  const publishAt = post.postPublishAtUtcMs;
  const unpublishAt = post.postUnpublishAtUtcMs;
  if (publishAt !== null && (!Number.isSafeInteger(publishAt) || publishAt < 0)) return block('INVALID_PUBLISH_CLOCK');
  if (unpublishAt !== null && (!Number.isSafeInteger(unpublishAt) || unpublishAt < 0)) return block('INVALID_UNPUBLISH_CLOCK');
  if (!post.siteDomainRoutable || !post.postIsGuestVisible) return block('NOT_PUBLIC');
  if (publishAt !== null && nowUtcMs < publishAt) return block('NOT_DUE');
  if (unpublishAt !== null && nowUtcMs >= unpublishAt) return block('UNPUBLISHED');
  if (!email.enrollmentExplicit || !email.audienceEnabled) return block('NO_AUTHORIZED_ENROLLMENT');
  if (!email.listBelongsToCustomer || !email.siteAndCustomerAuthorized) return block('TENANT_OR_ACCESS_DENIED');
  if (!email.sendScopeGranted) return block('SEND_PERMISSION_MISSING');
  if (!email.senderVerified || !email.unsubFooterValid || !email.templateAuthorized) return block('COMPLIANCE_BLOCKED');
  if (!email.quotaAvailable) return block('QUOTA_BLOCKED');
  if (email.contentOrigin !== 'verified_guest_render' || !email.noPremiumContentVerified) return block('UNVERIFIED_FREE_CONTENT');
  if (ledgerStatus !== 'absent') return block('ALREADY_RESERVED_OR_TERMINAL');
  // Intent identity excludes Site publication version. Republishing or editing
  // the Site MUST NOT generate a second email for the same enrollment.
  return {
    ready: true,
    intentKey: `${post.siteUid}:${post.postUid}:${email.listUid}:${email.enrollmentUid}`,
    sendNotBeforeUtcMs: publishAt ?? nowUtcMs,
  };
}
