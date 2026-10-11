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


## Email M2.3 owner Docker runtime PASS and M2.4 isolated intent ledger candidate (2026-10-11)

The owner ran M2.3 full Docker test (network disabled, PHP 8.3 with DOM) on Ubuntu: real Membership HtmlTeaserService behaviors **13/13 PASS**, safe-content composer **29/29 PASS**, real DOM sanitizer security cases **16/16 PASS**, final `RESULT=M2_3_ALL_RUNTIME_GATES_PASS`. This verifies the isolated composer/sanitizer, **not production email dispatch**.

Prepared M2.4 candidate artifact `/mnt/data/hakisend-email-m2-4-ledger-candidate-and-tests.zip` SHA256 `0b89fcaf40a121ec23f751fb5fa7b691a691704e7abb98afb1de20beebb26d7d`, containing:
- Pure `DispatchLedgerPolicy` with 73 passing PHP tests for customer/site/list ownership, post-linked event-bound clocks and exact M2.1 idempotency key, standalone UTC scheduling and private archive, due-only claim requiring current server-verified public Membership/sender/audience facts, blocked ambiguous retries.
- Unregistered `DatabaseIntentLedgerCandidate` Laravel query-builder source with unique registration/locked identity verification, DB CAS `pending->claimed` bound to expected due timestamp, pending-only reschedule/cancel, explicit ambiguous handling and positive owner-verified campaign correlation. No sender calls.
- Additive **unapplied** migration `2026_10_11_000201_create_hakisend_email_dispatch_intents_candidate.php` for intent audit table (unique stable key; tenant/site/post indices; uniqueness for customer+campaign_uid; intentionally non-destructive down). This supersedes the earlier M2.1 migration candidate only for later design review; **neither migration was deployed**.
- SQLite model-level concurrency tests 22 PASS, simulating eight simultaneous conditional claims with exactly one winner; and 13 static invariants PASS. Local total 108 checks, PHP syntax and ZIP CRC PASS. This is **not an actual Laravel+MySQL query integration test** and must not be described as one.
- No production changes, migrations, installed modules, Campaign launches, or user-list sends. M2.4 intent states do not guarantee exactly-once subscriber delivery when downstream Campaign acknowledgement is ambiguous; maintain manual reconciliation/no automatic retries. Before any production API: implement server-owned fact resolver, dedicated email scope/tenant bridge, queue and scheduled-send policy guard, actual MySQL integration race tests, source snapshot freshness under concurrency, and a safe admin/operator test-send route. Phase 3A stays TESTED/STAGED/NOT DEPLOYED as explicitly requested.


## Email M2.4 owner tests PASS; M2.5 Laravel/MySQL8 integration candidate (2026-10-11)

Owner verified Email M2.4 local: 73/73 PHP policy PASS, 22/22 SQLite CAS/concurrency PASS, 13/13 static invariants PASS (total 108/108). Original M2.4 was **not** tested against actual MySQL.

Built M2.5 test-only archive `hakisend-email-m2-5-laravel-mysql-isolated.zip`, SHA256 `e9f2b7a9ae0c9eeae76cef67d50909d00c75c33b2a0b89752dfcb4bbc13ad502`. The candidate retains the pure M2.4 DispatchLedgerPolicy unchanged and hardens database identity so it stores and checks Site UID, numeric Post ID, exact UTC due timestamp and send policy, in addition to tenant ID, audience and payload. This prevents an idempotency-key collision from silently accepting a changed schedule, Post, or Standalone policy. The altered migration and repository are **NOT production-ready and must not be installed**.

Archive runs Illuminate Database v12 DB Facade and its proposed migration on a fresh temporary MySQL 8 Docker instance, tests real registered intent transitions and 8 simultaneous registration and claim workers. Docker network is internal with no published MySQL host port; credentials are synthetic and disposable, MySQL data is tmpfs; no HakiSend SSH, token, subscriber or production connection. `run.sh --check` and `run.sh --run` provide a strict staged preflight and cleanup. Local PHP lint, Bash syntax, ZIP CRC, archive SHA256 manifest, unchanged policy test **73/73 PASS**, static contracts **13/13 PASS**; --check simulated with Docker info stub PASS. **MySQL 8 runtime execution has NOT YET been performed by owner and cannot be claimed PASS** (model container lacks Docker). This is the next user execution gate. Runtime may reveal further schema/query issues.

After a successful actual MySQL gate, work remains: authoritative Post/Membership public resolver, tenant-specific Campaign/List/Sender service, email send scope bridge, schedule acceptance vs scheduled dispatch policy audit, multiworker due-time reconciliation, downstream Campaign correlation to avoid duplicate sends, and operator-only test-send. No mail is sent and Phase 3A remains TESTED/STAGED/NOT DEPLOYED.


## M2.5 Owner Docker MySQL PASS → M2.6 scoped Campaign bridge candidate (2026-10-11)

Owner ran M2.5 v2 in Ubuntu Docker. **73/73 pure policy, 46/46 actual Illuminate DB/MySQL8 integration, eight worker duplicate registrations exactly one row, eight worker conditional claims exactly one winner**, source ledger retained through non-destructive rollback and temporary MySQL container/network removed, no production connection. Real final result: `M2_5_LARAVEL_MYSQL_ISOLATED_PASS_NO_DISPATCH`. The M2.5 build issue was fixed in v2 (autoload PHP before class_exists).

Using owner-provided exact production PHP files, confirmed core `CampaignService::createForAgent` attaches a Customer-scoped MailList and saves a new Campaign, while `CampaignService::launch` calls `validateLaunchPolicy` and checks unsubscribe footer under configured entitlement before calling `Campaign::execute`. The production `campaign:schedule` command independently calls `Campaign::execute`, so the deferred `scheduleSendForAgent` branch is not an adequate just-in-time policy boundary for plugin-managed scheduled emails. Use M2.5 intents + server-owned due-time reconciler + fresh Membership/source/sender/list checks, then launch **when due** rather than letting core cron send independently.

The Publishing OAuth/PKCE token issues `sites:read,content:read,content:write,publications:write,media:write` scopes only. **None is permission to send email.** The core Acelle `Auth::guard('api')` is not the Publishing bearer. Future `email:read` and `email:send` scopes must be opt-in, user/tenant authorized and not silently added to existing tokens.

Prepared **M2.6 authorization/preview candidate only** at `/mnt/data/hakisend-email-m2-6-candidate-and-tests.zip` (SHA256 `df0b79a2d7b2d065392f2c2c33fc61210bda05df57dceb1e1c1ea171cae3df3e`). PHP `EmailCampaignTenantGate` fail-closes on token user/customer mismatch, Site/MailList/customer mismatch, missing per-user policy and email scopes, sender/consent/suppression/footer, content safe source, public Post/clock and ledger claimed-once; `CampaignOwnershipCorrelation` verifies Campaign belongs to the customer and approved list and still has verified template/unsubscribe/sender; a `ScopedAudienceReadCandidate` aligns with the production Site entitlement and customer-filtered core MailList methods. `SafeDispatchBoundary` actively throws on send/schedule. **No actual emails, no routes registered, no DB mutations, no new token privileges.**

Local tests: **62/62 pure PHP authorization/campaign denial, 12/12 model-stub scoped audience reads, 18/18 static safety checks, total 92/92 PASS**; PHP syntax, Bash syntax, ZIP integrity, SHA manifest PASS. Local PHP 8.4 stub test does not replace actual Laravel kernel/Acelle customer-connection tests. Ubuntu Docker tests can run `cd ~/Downloads/hakisend-email-m2-6 && bash tests/run-docker.sh` (uses owner’s existing `hs-email-m2-5-laravel-mysql:local` container, network disabled). Optional read-only production fingerprint check `bash scripts/production-drift-check-readonly.sh`. Until user tests these, do not claim owner Docker or production gate PASS. Phase 3A remains STAGED/NOT DEPLOYED.

Next development is a real authorized email-only API, server-side Campaign template/draft construction, explicit customer and MailList resolution, contact opt-in/suppression verification, due reconciler and verified Campaign launch; operator-only test send + production rollout requires explicit later approval.


## Email M2.6 owner local PASS; M2.7 private Campaign draft bridge candidate (2026-10-11)

Owner ran M2.6 on Ubuntu using offline PHP Docker image: 18/18 static, 62/62 policy, 12/12 scoped audience = **92/92 PASS**, result M2_6_ALL_LOCAL_GATES_PASS_NO_SEND. M2.5 earlier confirmed actual MySQL 8 conditional claims (73/73 policy, 46/46 integration, 8 workers one winner).

M2.7 **draft-only candidate** locally generated at /mnt/data/hakisend-email-m2-7-private-draft-candidate.zip, SHA256 **22e6d4b0d6e515708164411ef565d8aaa8ad12bb5818792db54c765b52b8f200**. Contains four PHP classes: strict trusted-server-fact policy with separate email:read/email:compose scope, safe HTML-envelope with Acelle literal unsubscribe placeholder, draft workflow, and direct draft adapter calling observed CampaignService::createForAgent plus installer-observed TemplateService::setCustomHtml and Email::updatePlainFromHtml. Only Campaign STATUS_NEW with run_at null; no send, launch, schedule, public archive, database migration or production route. Future scheduled Post may have a Post-linked private draft generated from verified authoring/Membership free teaser, with public verification deferred to the send deadline. Standalone schedule is planning-only. Reject store_on_hakisend:false until real retention path audited.

Local PHP 8.4, static and mock CampaignService tests **89/89 PASS**: 56 policy + 11 mock core + 22 static; Bash/PHP syntax and ZIP manifest/integrity PASS. **Not a test against production TemplateService nor real Laravel HTTP/MySQL Campaign integration.** Core driver unregistered; do not call before server-owned Site-MailList map, live tenant facts resolver, explicit email:compose reauthorization, sender/content proof, idempotent private draft registration and customer Campaign policy.

Includes scripts/collect-core-draft-sources-readonly.sh, which copies exactly THREE PHP production source files (TemplateService, Email, CampaignPolicy) over existing SSH alias into local tar.gz with no production mutations or secrets. Owner has not run it. Proposed API routes in API-CONTRACT-DRAFT.md are documentation only. Next phase after exact source inspection is durable idempotent draft creation under real application kernel, MySQL integration and opt-in scope before owner-approved pilot. Sending/scheduling remain disabled. Phase 3A remains STAGED/NOT DEPLOYED.
