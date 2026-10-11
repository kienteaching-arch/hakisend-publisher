# HakiSend Email Campaign integration — Phase Email M1 (2026-10-11)

## Owner-approved semantics

The Obsidian publisher has two **distinct email types**.

1. **Post-linked free-excerpt email.** Enabled per Post and audience. It follows Post publication **exactly**: Publish Now triggers the email only after the Post becomes truly public; a scheduled Post triggers the email only when HakiSend actually publishes it; a rescheduled Post automatically reschedules its email; failed/unpublished Posts do not send. A subsequent edit or retry must not resend the email. Extract the public excerpt on the SERVER from the same source as the public page; never include premium or member-only content. No independent email clock.
2. **Standalone email.** No Post creation/publication. Recipient list, sender, subject, body, optional preheader, preview/test-send and explicit confirmation. Independent send-now or scheduled send in a timezone-aware timestamp. Email archive is private by default; do not assume storing or sending implies public visibility. No-save option requires separate retention audit before promises about what the mail engine retains.

## Findings from uploaded Acelle installer (NOT runtime production audit)

- app/Http/Controllers/Api/CampaignController.php: standard campaign list/create/update/show, run, pause behind auth:api, declared routes in routes/api.php.
- app/Http/Controllers/Api/MailListController.php: customer-scoped lists with uid/name/sender information. Acelle UIDs can be opaque (uses uniqid()), NOT UUID-only.
- app/Services/Refactor/CampaignService.php: saveSchedule uses Carbon and app timezone; launch invokes validateLaunchPolicy and unsubscribe-URL validation; sendTestForAgent and scheduleSendForAgent are available.
- app/Console/Commands/ExecuteScheduledCampaigns.php: existing campaign:schedule command. Campaign model enforces scheduled run_at and queued-state locking.
- Critical integration detail: the Publishing API Obsidian bearer token is not proven to authorize Acelle core auth:api. **Do not wire browser plugin directly to core Campaign routes without a verified permission/tenant bridge.**
- The uploaded installer does NOT include the installed HakiSend Sites or Membership plugin source. The exact public/free excerpt generation and Post publication hook are unknown until a read-only production audit. Never invent these.
- Because the scheduled-command path uses Campaign::execute, while CampaignService::launch performs unsubscribe prechecks, the backend adapter must ensure the SAME policy/compliance preconditions are checked at schedule acceptance AND before actual dispatch, rather than bypassing the gate.

## What was implemented locally

- Compiled HakiSend Publisher v0.1.6 **test beta only**, based on owner-tested v0.1.5 Read Preview plugin. New Obsidian mobile-friendly ribbon/command to create a Post-linked or Standalone email **local authoring plan** under HakiSend Emails/<site_uid>. New browse-local-plans command. No server writes, sending, or scheduling.
- Post-linked plans mandate sendPolicy=on_publication; standalone plans may choose sendPolicy=now or scheduled with explicit ISO8601 timezone offset stored in UTC. Prevent read-only import snapshots as linked sources, invalid Site IDs and pinned-site mismatch; avoid note overwrite; private archive false and email_dispatch_ready=false by default.
- Unit tests: 14 policy assertions PASS; mock Obsidian integration PASS (7 assertions including preservation of Read Preview and no HTTP); pure future server-dispatch contract tests PASS (16 cases covering after-commit public transition, verified free excerpt, auth, idempotency, and standalone time). Node compiled syntax PASS.
- The pure contract is **NOT** a deployed HakiSend sending backend. Local user documents labelled local_draft are never to be interpreted as confirmed server schedules.
- Bundle intended for HakiSend-Test only. The exact compiled v0.1.5 source remains unmerged on this GitHub branch, therefore the v0.1.6 beta is distributed as an isolated archive rather than silently upgrading src/main.ts in the repo.
- No HakiSend production code or database was modified by developing this candidate. Phase 3A stays staged/not deployed.

## Required next gate: production read-only survey

A bash script hakisend-email-production-audit-readonly.sh examines only route metadata, hashes/versions, verified Campaign schedule method signatures, and candidate Sites/Membership publisher/excerpt filenames. No tokens, subscriber rows, mail contents or production writes. Execute from owner's Ubuntu with SSH alias hakisend; examine output before proposing a source-level integration.

## Backend build steps after audit

1. Verify exact Sites Post publish state machine and free-excerpt source. Define server-authorized list and sender discovery under the scoped Publishing token, without crossing tenant boundaries.
2. Add Post-linked enrollment/association and durable idempotency ledger keyed siteUid+postUid+publicationVersion+listUid; implement an **after-commit and confirmed-public** event hook. Mark declined/failed/sent states; reschedule/cancel unpublished posts before dispatch.
3. Add standalone draft/schedule adapter invoking core Campaign policies, template validation, private-archive policy and authorized audience, with send-now/test-send explicit UI confirmations.
4. Add backend preview, test-send, logging, rate limiting and audit without leaking premium content or recipient PII.
5. Attach plugin sending UI and server-acknowledged Publishing Calendar. Never present a local date as a remotely accepted job.
6. Preserve Phase 3A frozen until the owner separately authorizes its production migration.


## Email M2 production metadata audit returned (2026-10-11)

Owner ran the existing safe remote architecture audit on the VPS. It returned production Sites 0.15.3, Membership 1.6.3, and working Campaign API / lists routes, plus Publishing API Post read/upsert and publication routes. The original PublishingContentService still has SHA256 1b5846da093344a62533d407443fa5eba97b634be8fe4d52bc11478549c02440: Phase 3A remains STAGED ONLY, NOT DEPLOYED.

Significant **installer vs runtime version drift**: production SHA256 for Campaign is 988d14952184f6d93663c32957109eafe12dd27dcdfbee289debb6e5a1d399c4 (installer 661d1766c92bae6072a0969354f85986697bafe7c7689df3cbc63e629c3215b3); CampaignService dc73812fc47749139d320e3dc078f111adf3d67024ad60e3f620135b3779c18d (installer d6a6e35d1322d0a8b40499e1484aed587e63aa45ba3c7cf290c7dcf4d80b4fd0); API CampaignController fec2da5c9a6ed10f58c2837423cb4e9aabd0057301c8f8a862f38895cd906e77 (installer bef10294e6772f5a174a44c68d0532b0515cf6a04be7b110786e6ce91a051635). The ExecuteScheduledCampaigns command **matches** the installer SHA256 e58e5a2e8ac5944a8b50a16e5a79d9815d056ef70bef549e1894ba6416a5b799. Consequently do NOT deploy code patched against uploaded installer directly into production.

Local Email M2 candidate built as PHP pure policy gate only, with 24 passing positive/negative PHP tests; tests enforce committed first-publication event, matched Site/Post and verified public excerpt, authorized and compliant audience, no Post-linked independent clock, privacy checks and server-accepted scheduled Standalone UTC dispatch. The policy returns a decision/key, performs no side effects and **does not yet protect concurrency through a SQL ledger**. Archive hakisend-email-m2-policy-and-audit.zip SHA256 5ee3456207dc0f0ca002d42fab5bf637bc2e0fae89b5b9d23e66e88121ee4e82; source collector script SHA256 78eaa1dd9b995aa12ecb10663228f47f421d734a03d4352245afd168a7da185d. Bash, PHP, static path allowlist, and ZIP integrity PASS.

The read-only whitelisted PHP source collector runs locally via existing SSH alias and streams production source bytes directly into a private Ubuntu-side archive. It never writes to the VPS or accesses env, token or subscriber tables. It includes SitePublicationService, PublicationContentVisibility, PublishingPublicationController, web Post controller, source authorization and Campaign core. **Collector not yet executed by user, and production sources not yet inspected**. Need this code before implementing actual Laravel outbound Campaign adapter, verified free excerpt, identity permission bridge, and DB-backed idempotent hooks. No mail dispatch or HakiSend production mutation yet.


## Email M2.1 exact live source audit + runnable isolated candidate (2026-10-11)

Owner sent exact 21-file production PHP audit archive. Confirmed from live source:
- `SitePublicationService::publish` snapshots all status=published posts, even future `publish_at`, in Site-wide immutable publication rows; it is **not** a per-Post send event. API `PublishingPublicationController::publish` can reuse unchanged Site publications and binds the live domain only afterwards.
- `PublicationContentVisibility::isPostVisible` applies `publish_at` and `unpublish_at` by current clock to immutable arrays on every public read; a scheduled Post goes live without a new publication transaction or hook. Therefore Post-linked sends require server-owned periodic due-time reconciliation against live public projection and cancellation/reschedule, not just a publish callback.
- `SitePost::excerpt` is not established as the canonical free text before membership paywall in the 21 inspected files. **Strict content-privacy blocker remains** until Membership 1.6.3 source split verified. Never email raw SitePost content or blindly assume excerpt is premium-safe.
- `CampaignService::launch` has launch-policy and unsubscribe-link checks; `scheduleSendForAgent` for deferred schedules calls `saveSchedule` and returns before `launch`, while the real `campaign:schedule` command invokes `Campaign::execute` directly. Needs policy validation both at schedule acceptance and at due-time dispatch.
- `CampaignController` uses core `Auth::guard('api')`; Obsidian's Publishing API uses separate bearer identity/scopes; no send privilege scope yet. A verified tenant bridge + authorizations are required.

Created local artifact `hakisend-email-m2-1-candidate-and-tests.zip` SHA256 `29f51d58a0929abd4a4c3aa8dee935b3364f8a6f30bf81954bee0052bf05a755` containing PHP side-effect-free `DispatchReadiness`, `IntentStateMachine`, an **unapplied** additive ledger migration candidate, 44 dispatch policy tests + 17 ledger transition tests, and a static assertion test confirming 9 critical production source contracts. PHP syntax/Bash syntax and ZIP CRC PASS. The stable Post-linked idempotency key includes siteUid, postUid, audienceListUid, enrollmentUid but **excludes Site publication version** to avoid duplicate sends after site republishing or editing. Uncertain Campaign acknowledgment state explicitly cannot automatically resubmit.

A safe next-source collector `scripts/collect-free-content-boundary-readonly.sh` gathers only selected Membership PHP code for locating the actual public-free/paywalled boundary, to a private local archive, without reading env, customer records or subscriber data and without production changes. The collector was **not run** by the owner yet, so a live email adapter remains BLOCKED. The isolated candidate intentionally has no API endpoint, registered command, mail send, DB migration execution, production file writes, or automatic email dispatch. Phase 3A remains not deployed.


## Email M2.2 — Membership content boundary now proven, teaser implementation still missing (2026-10-11)

Owner supplied a 10-PHP-file read-only production archive `hakisend-email-m2-membership-boundary-audit.tar.gz`, Membership version 1.6.3. Inspected exact `PublicContentProtectionService::protectPost`, `MembershipContentPolicyService`, Membership Site/Policy models and Sites `PublicSiteRepository`.

- Membership protection OFF (or no enabled Membership Site) leaves site content publicly readable; **Post clock/publication/domain still require independent verification**.
- For protected Site content, per-Post Free/Protected policy **takes precedence over Category**; otherwise a Free Category makes Post free, and absent policies remain Protected by default. Per-Post protected overrides free Category.
- For protected guest Post, the actual public view computes teaser from `$resource['content_rendered']` using `$this->teasers->truncate($fullHtml,$percent)`, appending a lock card separately. `MembershipContentPolicyService` allows **0,10,20,30%** with per-Post override or Site default (fallback 10). `SitePost.excerpt` is **not** the policy-governed free slice, and arbitrary percentage in prior draft design is not supported by this Membership version.
- The archive **does not include HtmlTeaserService.php**, so exact slice/HTML behavior remains a strict blocker for constructing emails from protected Posts. No guessing conversion or raw HTML permitted. For fully public Posts, editorial email body may be shorter than full public content.
- Built side-effect-free `MembershipFreeContentDecision` policy candidate using strictly trusted server-side evidence. It returns whether the request is allowed and which teaser percent, but **never constructs/returns HTML nor sends email**. 35 PHP scenarios and 11 assertions against the real PHP archive PASS. ZIP `hakisend-email-m2-2-candidate-and-tests.zip`, SHA256 `baef31e7020aeb81dd6ab7ba60f70c7bac288a2c24fac2194ddf369c487c0786`. No production mutations or mail dispatch.
- Bounded follow-up source collector `scripts/collect-html-teaser-readonly.sh` gathers only the production `storage/app/plugins/hakisend/membership/src/Services/HtmlTeaserService.php` into the owner's local private tarball with no remote writes or DB reads. **Owner has not yet run this collector**. Other blocks remain tenant-safe Campaign authorization bridge, DB ledger, reconciler and compliance-controlled dispatch.


## Email M2.3 — Exact runtime teaser integrated into fail-closed content composer (2026-10-11)

Owner supplied exact live HakiSend Membership 1.6.3 HtmlTeaserService.php archive, source SHA256 **01201473c219d10003f5ed0b9a62a7058c95d76fea5cd426aa17be72b8660690**. The public guest Post view invokes this service on resource.content_rendered with 0/10/20/30% and appends a lock card AFTER teaser generation. The teaser counts collapsed plain-text character length (mb_strlen when available), floors percent, traverses DOM text nodes (fallback token parser if DOM absent), preserves some original markup/attributes, adds an ellipsis. **Teaser markup is NOT intrinsically safe to send in email** because original script/event attributes/image URLs can be carried through.

Built an isolated, non-deployed M2.3 package at /mnt/data/hakisend-email-m2-3-candidate-and-tests.zip, SHA256 **04d56bc1e83d7ceaf1d6c6be6b6828487ba7f36c0a69a1e41054146aca06a4ae**. It contains a byte-identical test copy of owner-supplied runtime teaser, earlier MembershipFreeContentDecision, new PublicPostEmailContent (trusted current public projection and publication ID, Site/Post checks, source sha256, actual teaser-before-sanitizer, 0% fail-closed) and DomEmailHtmlSanitizer (reconstructs only whitelisted simple HTML with safe HTTPS href, removes scripts/iframes/attributes/trackers, blocks dangerous DTD and malformed/oversized/unicode inputs). PHP interfaces and tests included; no API, DB query, migration, Campaign send, site service replacement or production writes.

Local tests: 13 behavior checks of production teaser source (fallback path in no-DOM PHP), 29 composition/policy checks = **42/42 PASS**. Static membership call-site/source fingerprint checks: **9 PASS** (8 teaser internals + 1 actual Membership call site). PHP lint all source/tests PASS; zip integrity PASS. Sandbox PHP lacked DOMDocument and mbstring, so **the DOM sanitizer runtime security tests have NOT been executed**; verified sanitizer blocks when DOM missing. Package includes tests/run-tests.sh --full and tests/docker-full-tests.sh that builds an isolated php:8.3-cli-bookworm container with DOM/mbstring and executes 13+29+DOM tests with network disabled; owner should run the full suite on Ubuntu before accepting renderer. Do NOT call these tests already passed until output is provided.

Still blocked: real tenant-bound server resolver, email-specific Publishing API authorization, Campaign send/schedule adapter, durable database ledger and Post due-time reconciler, unsubscribe/suppression compliance and full tests. Phase 3A remains staged but NOT DEPLOYED per owner's explicit sequencing preference.
