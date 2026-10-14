# Backend integration contract — HakiSend Sites, Membership and Acelle

**Status:** implementation map grounded in the full v0.15.5 review ZIP. Existing endpoints marked EXISTING; all others are PROPOSED, not installed or enabled. Do not copy backend source or secrets into the public Obsidian repository.

## Confirmed EXISTING v0.15.4/v0.15.5 APIs

The Sites source provides bearer-authenticated, independently scoped APIs:

| Operation | Method and real route | Token scope |
| --- | --- | --- |
| Upsert authoring Post | `PUT /api/v1/hakisend/sites/{siteUid}/posts/upsert` | `content:write` |
| Publish Site snapshot explicitly | `POST /api/v1/hakisend/sites/{siteUid}/publish` | `publications:write` |
| List authored Posts | `GET /api/v1/hakisend/sites/{siteUid}/posts` | `content:read` |
| Read authored Post | `GET /api/v1/hakisend/sites/{siteUid}/posts/{postUid}` | `content:read` |
| List enabled Site Audiences | `GET /api/v1/hakisend/sites/{siteUid}/emails/audiences` | `email:read` |
| List / create Private Draft | `GET,POST /api/v1/hakisend/sites/{siteUid}/emails/drafts` | `email:read` / `email:compose` |
| View / revise Private Draft | `GET,PUT /api/v1/hakisend/sites/{siteUid}/emails/drafts/{draftUid}` | `email:read` / `email:compose` |

Routes enforce `PublishingApiHardening`, `PublishingApiAuthenticate`, `PublishingApiScope`; private Draft also checks current customer, Site entitlement, enabled Audience and permissions in `EmailDraft/DraftAccess.php`. Draft API is already implemented by `Controllers/Api/EmailDraftApiController.php`, with `request_uid` idempotency and revision-based update.

**v0.15.5 review only:** `CampaignDraftPromotionController` has browser-only customer-authenticated `prepare-campaign` and `promote-campaign`, with feature gate `hakisend-sites.campaign_draft_promotion_enabled=false`. The candidate must not be considered active production behavior. Even if eventually enabled, Promotion creates unsent `Campaign::STATUS_NEW` and `run_at=null`; it is not a delivery scheduler.

## PROPOSED server-only adapters (not implemented)

1. **MembershipGuestContentService:** Obtain the exact canonical public/guest version of the Post from Membership's server-side policy (e.g. guest preview 0/10/20/30%, where configured). Must inspect the separate Membership plugin source first; Sites' private authoring API and authored Post HTML are *not* proof of safe free content. Return only sanitized public HTML, post visibility, verified free-boundary, content hash, publication version, current server clock and durable Post identity. Reject unpublished/protected content when guest projection cannot be verified.
2. **PostEmailEnrollmentService:** Bind owner-authorized `site_uid + post_uid + list_uid + enrollment_uid + template_uid + sender identity + enabled flag`, opt-in only. Persist once, audit every change; do not allow arbitrary newsletter audience. A Post edit/site republish is not a new enrollment.
3. **EmailTemplateRenderer:** Create the mailing HTML using the **authorized customer template** and safe guest slice, not local content. Enforce branding, verified sender, unsubscribe/footer/links and tenant identity; preview with a non-delivery endpoint.
4. **DuePostEmailReconciler:** Server scheduler checks pending enrolled Posts on each run. Check authoritative *current* guest-public status / publish and unpublish times / Site domain / Audience / quota and sender, not just a publication event; future posts can become public without new webhook. Atomic reservation ledger unique by customer/Site/Post/enrollment/list prevents duplicates. Ambiguous downstream outcomes require reconciliation, not automatic resend.
5. **AcellePromotionAdapter:** Reuse tested `CampaignPromotionService` only after isolated full Laravel+MySQL fixture verifies single transaction, rollback, concurrency and tenant guard; Campaign must remain `new`, `run_at=null`, no queue, no send.
6. **SeparateSenderAuthorization:** Explicit customer consent to enroll Post-linked Email and separately authorize actual send/schedule permissions. No implicit use of `email:compose` as `email:send`.

## PROPOSED additive HTTP API (contract only)

- `GET /api/v1/hakisend/sites/{siteUid}/posts/{postUid}/email-readiness`: preview safe guest content status and blockers (customer-authenticated, `email:read` and `content:read`).
- `PUT /api/v1/hakisend/sites/{siteUid}/posts/{postUid}/email-enrollment`: enable/update only with proper owner-approved list + template + sender and idempotent enrollment revision (`email:compose`, additional server permission).
- `POST /api/v1/hakisend/sites/{siteUid}/posts/{postUid}/email-preview`: render preview; **never sends** (`email:read` or stronger).
- `GET /api/v1/hakisend/sites/{siteUid}/calendar`: return authoritative Post/Email status and schedule (`content:read`, `email:read` filtered by visibility).
- A distinct write route for send/schedule must be separately defined and enabled after sender tests; it does not exist in v0.15.5.

No proposed endpoint should be silently exposed as if already present. Names are provisional until implementation review.

## Vertical-slice acceptance

- Existing Obsidian OAuth token connects and fetches enabled Audiences and private Drafts.
- A private Standalone Draft is created with stable UUID, read back with exact revision, and never dispatched. A stale revision gives 409, existing note not overwritten.
- Backend isolates real Laravel services with synthetic MySQL (a **new M290 schema**, NOT the M285 fixture). Never use production subscribers or real sending servers.
- Signed-in user can preview canonical guest slice. A paid-only paragraph can never appear in guest preview/email regardless of author note.
- Scheduling a Post but not yet guest-visible yields **zero Campaign and zero deliveries**. At due time, server rechecks guest public state and creates at most one pending intent. Cancellation, post unpublishing and no confirmed audience prevent sending.
- Concurrent due workers cannot create duplicates; failed transaction fully rolls back. Unknown send outcome must not retry automatically.
- Calendar is a server-state projection; all client-only offline changes are visibly tentative. A Post-linked Email inherits Post time.
- Phase 3A bidirectional sync remains paused until Email and Calendar are both accepted.

## Not for production

Do not install v0.15.5 disabled review ZIP, enable the feature gate, run schema migration, send test mail to real subscribers, or add backend code to this public repository. Each of these is separately gated.
