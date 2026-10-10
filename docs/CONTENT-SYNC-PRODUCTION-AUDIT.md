# Content Sync Phase 0 — Production read-side API audit

Date: 2026-10-10. This is a design document, **not** a claim that the described read endpoints exist on HakiSend.

## Confirmed publisher contract from plugin v0.1.3
- OAuth browser connection and secure token storage; Site discovery `GET /api/v1/hakisend/sites`.
- Category lookup `GET /api/v1/hakisend/sites/{siteUid}/categories`.
- Markdown upsert `PUT /api/v1/hakisend/sites/{siteUid}/posts/upsert`, external identity `{source: obsidian, id: external_id}`.
- Publishing is a separate Site operation.
- Existing plugin does **not** import the remote Post body into the vault and does not have a known read-side Post list/detail contract.


## Evidence from the first production read-only audit (2026-10-10)
Source: owner-supplied terminal output from `/var/www/sites/hakisend.com/app`.
- Runtime: PHP 8.3.33, Laravel 12.61.1.
- Installed `hakisend/sites` plugin version: **0.15.3**.
- Exact published integration route inventory: nine routes, including:
  - `GET /api/v1/hakisend/sites`
  - `GET /api/v1/hakisend/sites/{siteUid}`
  - `GET /api/v1/hakisend/sites/{siteUid}/categories`
  - `GET /api/v1/hakisend/sites/{siteUid}/tags`
  - `PUT /api/v1/hakisend/sites/{siteUid}/posts/upsert`
  - `PUT /api/v1/hakisend/sites/{siteUid}/pages/upsert`
  - `POST /api/v1/hakisend/sites/{siteUid}/publish`
  - `POST /api/v1/hakisend/media/assets`
  - `POST /api/v1/hakisend/media/assets/resolve`
- **There is no Post collection GET, single-Post detail/body GET, changes-since API or deletion/tombstone feed in this publishing API route inventory.** This does not imply the internal authenticated customer UI lacks Post reads.
- Identified implementation: `PublishingContentController@upsertPost`, `CustomerSitePostsController`, `SitePost`, `SitePostTranslation`, authentication/scope middleware, external-content identity migration and Post schema migration.
- **Next gate:** obtain a narrowly allowlisted archive of the above PHP *source files only* (no production DB data, `.env`, tokens, log files or Post bodies), inspect actual storage and authorization contracts, then design read-side API and optimistic concurrency.
- Do not mutate production until an independent candidate patch passes unit/integration tests and release gates.

## Required evidence from production HakiSend
1. Authenticated route listing for the actual Site Posts read API (GET list, GET detail/body, changes-since, deletions).
2. Server code paths for controller, DTO/resource serialization, service, model, migration; verify that Markdown stored as authored can be returned without losing local links/featured media.
3. Source/version fields: Site UID, Post UID, external ID, created_at/updated_at, content hash/revision, tombstone/deleted_at, publication/scheduled state.
4. Token scopes / authorizations for listing and reading each Site; ensure a user cannot read another owner's Posts.
5. Pagination and timezone filtering; validate stable ordering across pagination and per-site Locale semantics.
6. Server write preconditions or atomic compare-and-swap for conflict prevention (ETag/If-Match or version/hash), including upsert semantics.
7. Rate limits, request IDs, and audit logs. Never collect credentials, customer data, or Post contents in a diagnostic bundle.

## User-facing Sync Mode semantics
- **All**: bootstrap all accessible Posts from explicitly selected Sites, paginating from the oldest to newest; show counts and dry-run. No unilateral delete.
- **From now**: record the server-derived high-watermark at activation; ingest subsequent changes only. Do not confuse with local device clock.
- **Since date**: inclusive start of a date interpreted in an explicitly selected timezone; convert to UTC cursor; fetch paginated changes from that point.
- **One-way import** or **bidirectional reconcile** must be a separate choice from date range and from Vault Sync. Never enable blind upload of all local notes as a side effect of downloading Posts.

## Initial sync and conflict policy
- Keep independent state per Site and per local Vault, recording `site_uid`, `post_uid`, external ID, content hash, server revision, last successful cursor, and a safe local file path.
- Before every write compare current server revision with the last synced base revision. On divergence, preserve both sides, create local conflict copy, and ask for a deliberate resolution.
- Reject external ID collisions across Sites and duplicate local notes; Site UID is part of identity. Do not map only by filename/title.
- Reads paginate with resumable cursor. HTTP retries are bounded; write retries use idempotency keys.
- No automatic publishing, emailing, or deleting from ordinary sync actions.
- Obsidian Sync or independently chosen vault sync transports local files/attachments between desktop and phone. HakiSend Content Sync is not a general-purpose filesystem sync. Each device independently authorizes HakiSend; never copy secure tokens in vault settings.
- Obsidian mobile must use supported APIs and touch-friendly UI; background sync is not guaranteed.

## Production evidence gathering
Read-only audit helper was prepared in this ChatGPT conversation as `hakisend-obsidian-sync-audit-readonly.sh`. Run on the HakiSend VPS with:
```bash
bash hakisend-obsidian-sync-audit-readonly.sh /var/www/sites/hakisend.com/app
```
The helper prints route URI/method/action, Site plugin version, relevant code filenames, and source file/line references only; it prints no DB rows, credentials or Post bodies.

Stop here until the actual production API contract is known; do not invent new endpoints or run migrations on production.

## Phase 2B service audit — verified from 10 PHP files (2026-10-10)

- **Critical fidelity result:** `PublishingContentService::upsertPost` reads `content.body` as Markdown, calls `renderBody($body)`, then persists `SitePost.content = $html`. Existing Posts schema has no raw Markdown column. Therefore do not label a read-side API response as Markdown, and do not overwrite local Markdown with returned HTML. HTML-only legacy records must be previewed/read-only until explicitly converted.
- `SitePost` uses `SoftDeletes`; timestamp/deletion polling is possible, but it is a state scan, not a reliable append-only event log. Hard-deletions cannot be recovered from soft-delete feed alone.
- `SitePost::refreshSourceHash()` hashes rendered content and several authoring fields, but not tag relations. Tags-only changes may be reported by Upsert as updated without changing the Post row's `updated_at`, so a timestamp-based changes feed can miss them.
- `PublishingAuthorizationService::SCOPES` already includes `content:read`. Site entitlement/ownership checks exist; reusing them is necessary but not sufficient until cross-tenant and token-scope integration tests pass.
- A Phase 2B candidate package explicitly returns `content.format = html`, `editable_source_available = false`, `roundtrip_safe = false`. It is a **read-only API candidate** with no automatic publication, no migrations and an intentionally disabled `--apply`.
- For future editable sync, store the original submitted Markdown atomically with rendered HTML, track provenance and freshness when web editor modifies HTML, and require atomic server revision preconditions on update. Existing legacy HTML must remain read-only unless the author opts into conversion.
- Do not count a Phase 2B `--check` PASS as authenticated integration-test approval.

## Phase 2C gate: production metadata-only database/schema inspection

The owner ran Phase 2B `APP=/var/www/sites/hakisend.com/app bash run.sh --check` twice with matching results: `SITE_PLUGIN_VERSION=0.15.3`, `BASE_CHECKSUM=PASS`, `CANDIDATE_PHP_SYNTAX=PASS`, `READ_ENDPOINTS=3`, `PRODUCTION_CHANGED=NO`, `RESULT=CHECK_PASS_NO_CHANGES`. The outcome confirms static compatibility, **not endpoint correctness nor approval to deploy**.

Next: run `hakisend-ob-sync-phase2c-schema-audit.sh` on the HakiSend VPS. This script only prints production route listings and metadata (column names/types and index definitions) for Site Posts, Post Tags, Post Translations, Categories. It performs no migrations, POST/PUT, row reads or writes. We need to establish whether timestamps have second vs microsecond precision, whether `updated_at`/ `deleted_at` composite indexes exist, and whether nullable source Markdown/revision fields are currently present before deciding on cursor semantics and candidate migrations.

**Release blockers still open:** real authenticated endpoint permission tests, test DB integration for pagination, timestamp/tags-only change capture, soft-delete/restore, source-Markdown fidelity, server-side compare-and-swap on writes, rollback plan. Phase 2B explicitly has `--apply` disabled. Do not deploy merely on a green static `--check`.


## Phase 2C passed; Phase 2D source-fidelity candidate prepared

- Owner-provided Phase 2C v2 schema audit result: `RESULT=SCHEMA_AUDIT_PASS_READ_ONLY` on MySQL, Sites v0.15.3.
- `hakisend_site_posts` has `content=longtext`, `updated_at=timestamp`, `deleted_at=timestamp`; unique external identity index `(site_id, external_source, external_id_hash)`. No raw Markdown field, and no composite Site/time change-feed index.
- Translations have an independent HTML content field and their own `updated_at`; tags are stored in `hakisend_site_post_tags`. A Posts-only time cursor is insufficient for reliable changes across tags and translations.
- Proposed Phase 2D candidate (outside the Obsidian repo, supplied as standalone tarball for checking): an additive `hakisend_site_post_sources` table storing raw Markdown, Markdown SHA-256, and rendered HTML SHA-256, updated in the same transaction as `PublishingContentService::upsertPost`. On reads, a separate service permits returning editable Markdown only if the saved source and current stored HTML still match both hashes; existing HTML-only posts remain read-only. The candidate explicitly sets `roundtrip_safe=false` until optimistic concurrency is implemented.
- Safety: the `run.sh --check` candidate compares the existing PublishingContentService SHA-256, checks PHP syntax and new-file absence, and does not modify production. `--apply` and `--rollback` deliberately disabled. Local static checks and a baseline-mirror `--check` passed; live MySQL integration tests are **not done**.
- Next gate: candidate `--check` against production, then isolated MySQL integration and review of write preconditions/event cursor. Do not run migrations on production based on this check alone.

## Phase 2D production check and Phase 2E offline tests (2026-10-10)

- Owner ran Phase 2D `run.sh --check` on VPS with `SITE_PLUGIN_VERSION=0.15.3`, `BASE_CHECKSUM=PASS`, `CANDIDATE_PHP_SYNTAX=PASS`, `SOURCE_STORAGE=ADDITIVE_TABLE`, `MIGRATION_APPLIED=NO`, `PRODUCTION_CHANGED=NO`, `RESULT=CHECK_PASS_NO_CHANGES`.
- A separate offline-only PHP test suite against the same Phase 2D candidate successfully checked **9** source-fidelity behaviors (including UTF-8 roundtrip, HTML modification detection, legacy HTML-only record, corrupt fingerprints, isolated post keys), **4** migration-shape guards, and **2** transactional-placement/field checks. Results `OFFLINE_UNIT_PASS`, `MIGRATION_SHAPE_PASS`, `PHASE2E_OFFLINE_TEST_PASS`.
- These tests stub the Laravel DB facade and migration Schema Blueprint; they **do not** open a database, execute actual SQL, exercise the real PublishingContentService upsert or test tenancy authorization. Therefore they are *not* integration evidence.
- Before enabling a release, run in a dedicated **isolated** test DB with real Laravel dependencies and migration; verify source insert/update/idempotent write, duplicate identity, rollback, HTML-only legacy record, web editing, token scopes, and concurrency. Never use the live production DB for these tests. The current Phase 2D package intentionally disallows `--apply`.

## Phase 2F isolated SQLite integration gate (prepared; not yet executed on VPS)

User confirmed `PDO_DRIVERS=mysql,sqlite` on VPS (2026-10-10). A standalone test archive `hakisend-ob-sync-phase2f-sqlite-isolated-tests.tar.gz` has been prepared. The PHP harness requires only the installed Laravel `vendor/autoload.php`, an isolated Illuminate Container and `database=:memory:` SQLite. It never boots HakiSend `bootstrap/app.php`, never reads `.env`, and never establishes a configured MySQL connection. It loads the exact Phase 2D candidate migration and source helper, plus the current `SitePost` Eloquent class, against a synthetic parent Posts schema.

Tests planned: actual migration execution, repeat migration idempotency, schema fields, uniqueness and foreign keys, Markdown read through genuine Eloquent class and DB facade, invalidation after web HTML modification, duplicate upsert, rollback in a DB transaction, non-destructive `down`, and physical-delete cascade. The archive is a **test harness, not a release**; syntax was checked locally but database execution requires VPS Laravel dependencies. Passing SQLite integration will **not** establish correctness against MySQL, real `PublishingContentService::upsertPost`, HTTP auth and cross-tenant access, tag/translation updates, or concurrency. MySQL isolated integration and a read API release review remain mandatory. Phase 2D production `--apply` is still disabled.


## Phase 2F.1 SQLite PASS; Phase 2G temporary Docker MySQL prepared (2026-10-10)

- Owner executed the corrected isolated Phase 2F.1 harness on the VPS; `TESTS_PASSED=22`, `RESULT=SQLITE_MEMORY_INTEGRATION_PASS`, `PRODUCTION_CHANGED=NO`. It verified source migration fields, idempotent insertion, original Vietnamese Markdown roundtrip, HTML modification invalidation, database transaction rollback, unique source identity, FK validation, conservative down migration, and hard-delete cascade. The real HakiSend app was **not** bootstrapped.
- Prepared **Phase 2G** with a two-stage script: `--check` only reads local prerequisites; `--run` explicitly creates a temporary Docker MySQL 8 test container using isolated random database credentials, private tmpfs storage, no production DB settings, and a dynamically mapped loopback-only TCP port; stops/removes container on exit. The Laravel app is not bootstrapped and the parent Post schema is synthetic. Requires Docker and adequate capacity; run on staging preferably.
- Phase 2G source syntax and packaging checked locally. It has **not yet been run on VPS**, so no MySQL PASS is claimed.
- Following MySQL results, the full real PublishingContentService upsert path, HTTP read endpoints / cross-tenant authorization, pagination and deleted/tags/translations feed, server compare-and-swap remain outstanding. Phase 2D production `--apply` stays disabled.


## Phase 2G.2 real MySQL integration: 22/22 PASS (2026-10-10)

The owner ran Phase 2G.2 on local Ubuntu with Docker MySQL **8.0.46**, no HakiSend app bootstrap and no production MySQL connection. Observed: `MYSQL_TCP_AUTH_QUERY=PASS`, `TESTS_PASSED=22`, `RESULT=ISOLATED_MYSQL_INTEGRATION_PASS`, `RESULT=PHASE2G_LOCAL_RUN_FINISHED`, `TEST_CONTAINER_REMOVED=YES`, `TEST_MYSQL_NETWORK_REMOVED=YES`, `PRODUCTION_CHANGED=NO`. The test covered actual MySQL migration, source-fidelity read/write via a **synthetic parent Posts schema**, Eloquent query behavior, idempotent source upsert, HTML-edit invalidation, rollback, unique constraints, FKs and cleanup.

**Limit:** The test did *not* exercise the real `PublishingContentService::upsertPost()` or real HakiSend HTTP authentication/authorization, and cannot validate conflict-safe two-way writes. Next milestone Phase 2H must exercise the genuine service with realistic dependencies in a fully isolated environment and explicitly test whether a web-side modification can be overwritten by a subsequent Obsidian upsert. Neither source hash nor `updated_at` alone is a server-enforced compare-and-swap precondition.

A narrow read-only source-collection helper `hakisend-ob-sync-phase2h-service-source-audit.sh` captures the required PublishingMarkdownRenderer, PublishingFrontmatterPolicy, PublishingTaxonomyService, SiteLocaleRegistry, PageHtmlGuard, and Site/Category/Page/Post/Tag models and migrations from production, without environment secrets or database rows. Phase 2D `--apply` stays disabled.


## Phase 2H — genuine Upsert service integration (local test package prepared, not run)

- User collected 18 additional HakiSend Sites production PHP dependencies read-only; archive SHA-256 `de3031382c0a7f2164b4cb11a9c9a90828cf3c1ae7de0ac40672c44c576dec29`, `PRODUCTION_CHANGED=NO`.
- A standalone **local laptop** package `hakisend-sync-phase2h-real-upsert-mysql-tests.tar.gz` now contains the real Sites models, `PublishingContentService` from the Phase 2D candidate, real Markdown renderer, frontmatter, taxonomy, locale policy and source provenance reader, plus Laravel/Composer dependencies and a synthetic MySQL 8 parent schema. The real source-table migration is loaded. Featured-image media paths are **not exercised**.
- The local runner reuses the successful isolated Docker pattern from Phase 2G.2: test-only random Docker MySQL, internal network, no host ports or production database configuration, with cleanup on exit; `--check` does not create a container. PHP and Bash syntax, archive integrity and SHA checks have passed locally; the runtime has **not yet been executed on MySQL**.
- Tests are written to measure creation, updates, idempotency, Site/category isolation, tag association, rollback injected at source insert, and stale-client overwrites. In particular, the existing Phase 2D `upsertPost` does not check an expected server revision before overwriting HTML. A stale Obsidian save should therefore overwrite a newer web edit. If verified, the correct classification is `REAL_UPSERT_INTEGRATION_PASS_WITH_RELEASE_BLOCKER`, **not release-ready**.
- The following must precede enabling two-way sync: atomic server compare-and-swap preconditions, tag/translation change events, real HTTP authorization and pagination tests, full-schema MySQL and release/rollback gates.


## Phase 2H.2 real service progress; rollback test fix (2026-10-10)

- Phase 2H.2 actual isolated Docker MySQL test successfully reached `PublishingContentService::upsertPost`. Confirmed: real Eloquent model events; Post creation and stable UID; real Markdown-to-HTML rendering; exact source Markdown roundtrip; idempotent retry; Post and source updates; tags and pivot relation; same external ID on distinct Sites; rejection of wrong Category.
- It failed **in the test harness** at the rollback-injection step because MySQL error 1419 prohibited creating a test-only TRIGGER while binary logging was enabled without elevated privilege. This is not a proven HakiSend rollback bug and it is not yet evidence of safe conflict prevention.
- Phase 2H.3 fixes only the private test harness: a temporary MySQL CHECK constraint rejects one marker in the source Markdown, causing the Post/source transaction to fail without CREATE TRIGGER/SUPER; constraint is dropped in a finally block and the whole database is discarded afterward. Production business logic and migration remain unchanged; static PHP/Bash and archive checksum checks pass locally; awaiting user's Docker integration run.
- The stale-client overwrite test remains required; a confirmed overwrite is a release blocker to be fixed with server-enforced optimistic concurrency.


## Phase 2H.3 confirmed 20/20 PASS; Phase 2I opt-in conditional-write candidate

Owner completed Phase 2H.3 on isolated Docker MySQL 8 on 2026-10-10: `TESTS_PASSED=20`, `RESULT=REAL_UPSERT_INTEGRATION_PASS_WITH_RELEASE_BLOCKER`, `TEST_CONTAINER_REMOVED=YES`, `TEST_MYSQL_NETWORK_REMOVED=YES`, `PRODUCTION_CHANGED=NO`. The real `PublishingContentService::upsertPost` passed creation, update, idempotent source, tags, categories, cross-Site identity, transaction rollback and web HTML provenance invalidation. **Crucially, it reproduced a stale Obsidian write overwriting a newer web edit** (`BLOCKER_CONFIRMED=STALE_OBSIDIAN_UPSERT_OVERWRITES_NEWER_WEB_HTML`).

Prepared standalone Phase 2I test candidate `hakisend-sync-phase2i-conditional-upsert-tests.tar.gz` (not deployed), built on the verified Phase 2H.3 package. The service's opt-in `sync: {mode: "if_match", expected_state_token: "<sha256>"}` checks the canonical Post/Tags/Translations/source state token inside a transaction with a Post row lock before writing; conditional creation requires a null expected token; divergence throws a conflict exception, represented as HTTP 409 in the proposed controller adapter. It also refuses conditional edits of HTML-only or web-diverged Posts, even when a fresh token is supplied. Reply contains `data.sync.state_token`. The candidate does not add a database migration beyond Phase 2D source storage.

**Release blockers remain:** legacy unconstrained Upsert endpoint, non-locking web/Tags/Translations mutation paths and concurrent races, unfinished GET Posts/token endpoint, real authenticated HTTP integration, change-feed/tombstone correctness, full prod-schema upgrade and rollback review. Phase 2I is an isolated Docker candidate only; local PHP/Bash syntax and checksums pass. No MySQL runtime PASS is claimed until the user's next run. Global conflict-safe two-way sync remains **NO**.


## Phase 2I 32/32 PASS — Phase 2J website writer gap (2026-10-10)

- User ran the isolated Docker MySQL Phase 2I candidate with **32 successful assertions**, `RESULT=CONDITIONAL_REAL_UPSERT_MYSQL_TEST_PASS_WITH_RELEASE_BLOCKERS`, `PRODUCTION_CHANGED=NO` and confirmed cleanup of container/network. Conditional Post writes accept matching state tokens and reject missing/stale/cross-Site versions; source provenance and Tags/Translations participate in the state snapshot. These are **service-level tests**, not real authenticated HTTP tests.
- Confirmed remaining output: `LEGACY_UNCONDITIONAL_WRITES_STILL_ALLOWED=YES`, `GLOBAL_CONFLICT_SAFE_TWO_WAY_SYNC=NO`, `RELEASE_BLOCKERS=legacy_api_and_parallel_tag_translation_writers_and_http_authorization`.
- Further review of the *production* `CustomerSitePostsController::update` from the Phase 2 source archive confirms its transaction does `$postRecord->fill($data)`, `$postRecord->save()` and `syncTags` without an explicit `lockForUpdate()` on the parent Post row or form-version precondition. Its `destroy` similarly soft-deletes without guarded concurrency. Therefore a web edit path can bypass an API-only guarded write discipline. Do not turn on bidirectional sync yet.
- Phase 2J requires review of `CustomerSitePostTranslationsController`, Tag writer controllers, and Blade editor forms before a patch. An allowlisted read-only collector `hakisend-sync-phase2j-web-writer-source-audit.sh` was prepared to retrieve those exact PHP/Blade files only; no environment secrets or user Post records.
- Recommended compatibility transition: protect Posts **explicitly enrolled in managed sync**, while preserving legacy behavior for non-enrolled Posts until Obsidian v0.1.3 clients can upgrade. All writers (website base Post updates, post-translations, Tags, API, soft-delete/restore) must use a consistent parent Post row lock and freshness precondition for enrolled Posts. If older plugins attempt a write to an enrolled Post without a token, fail closed with actionable upgrade/conflict message instead of silently overwriting. A web editor form must carry an expected-state token and validate at submit. All this must be implemented and tested; it is *not* present in Phase 2I.
- Verification requirements: stale website form rejects edit after an Obsidian save, stale Obsidian request rejects edit after a website save, same-second Tags/Translation writes are detected, simultaneous requests have a single winner, post deletion/restoration is guarded, backwards compatibility on non-enrolled Posts, authenticated API scope/tenant tests, no unexpected Site publication/emails.


## Phase 2J opt-in managed writer guard candidate (prepared 2026-10-10; awaiting MySQL test)

The owner provided Phase 2J read-only archive containing 15 PHP/Blade source files from current HakiSend production. Direct review shows `CustomerSitePostsController::update` saves Post and syncs Tags transactionally **without** a Post row lock/form version precondition; `destroy` soft-deletes without guard. `CustomerSitePostTranslationsController::update` updates a translation outside parent-Post locking. The base Post and Post-translation edit forms do not carry an expected Post state token.

New standalone candidate `hakisend-sync-phase2j-managed-writers-candidate.tar.gz` builds on the Phase 2I isolated MySQL service tests and adds:
- **Explicit-only** sync enrollment table `hakisend_site_post_sync_enrollments` (FK/unique `post_id`); the migration is additive and has an intentionally non-destructive `down`. No Post is enrolled merely because it has been edited with v0.1.3.
- `PublishingManagedPostGuard`: opt-in requires a fresh canonical state token and verified original Markdown source; managed Posts reject legacy unauthenticated-*version* Upserts (authorization still enforced by existing app separately). Non-enrolled Posts retain compatibility.
- Candidate web Post Edit/Delete and manual Post Translation writers acquire the parent Post `lockForUpdate()` and compare their hidden form's `sync_expected_state_token` when Post is enrolled; stale edits return a user-visible form error. The API conditional Upsert continues its existing Post lock and token check.
- **No new production endpoint** has been added to enable enrollment, because it needs an authenticated/authorized HTTP contract and Obsidian-client upgrade gate. No production migration or file mutation is authorized.
- Static check: all PHP files pass `php -l`, runner passes `bash -n`, SHA256 archive manifest passes. Isolated Docker MySQL runtime **not yet executed**.
- **Remaining blockers:** AI/background translation writers; any Tag/category changes that affect state; public API 409 error mapping, read-side Posts API, full-schema HTTP authorization tests, simultaneous request race tests, source preservation, data deletion/restoration discipline. The actual web HTTP controllers/Blade rendering are not executed in isolated test. The candidate must NOT be deployed based on a static check or a service-only MySQL PASS.

Phase 2J next user step: run the downloaded candidate's `bash run.sh --check` then `bash run.sh --run` on the isolated laptop Docker environment and share the complete result.


## Phase 2J.1 integration harness migration-order fix (2026-10-10)

Owner ran Phase 2J original Docker MySQL harness; it passed source migration and initial Post creation but stopped on `SQLSTATE[42S02] 1146: hakisend_site_post_sync_enrollments doesn't exist`. Direct source inspection established that the harness calls `PublishingManagedPostGuard::isEnrolled()` during the first Upsert but deferred applying the enrollment migration until near the end of the test. This is a **harness setup order bug**, not a demonstrated production schema defect.

Created `hakisend-sync-phase2j1-managed-writers-migration-order-fix.tar.gz`: enrollment migration runs immediately after source migration and before first Upsert, with assertions for table creation and repeated-migration idempotency. No HakiSend PHP service/controller/Blade or database migration logic was changed. Local validation: PHP syntax all source files PASS, Bash syntax PASS, SHA256 checks 29 files PASS. **Not yet retested on Docker MySQL.** Production unchanged. The previous Phase 2J service/HTTP release limitations still apply.


## Phase 2J.1 47/47 isolated MySQL PASS; Phase 2K source audit gate (2026-10-10)

- User ran Phase 2J.1 isolated Docker MySQL 8 with `TESTS_PASSED=47`, `RESULT=MANAGED_WRITER_GUARD_SERVICE_MYSQL_TEST_PASS_WITH_RELEASE_BLOCKERS`, `TEST_CONTAINER_REMOVED=YES`, `TEST_MYSQL_NETWORK_REMOVED=YES`, `PRODUCTION_CHANGED=NO`.
- Passed the source fidelity and real Upsert assertions, conditional-write token tests for edits and tags/translations state, opt-in enrollment, rejection of legacy Upsert on enrolled Posts, and managed web-form token guard service checks. **No live HTTP routing/controller execution was tested; the candidate remains not production-ready.**
- The test explicitly reported `APP_HTTP_ROUTING_TESTED=NO`, `ASYNC_TRANSLATION_WRITERS_AUDITED=NO`, `GLOBAL_CONFLICT_SAFE_TWO_WAY_SYNC=NO`.
- Inspection of original website Post translations controller confirms `TranslateSiteContentJob::dispatch(..., 'post', ...)` when starting AI translation. The async job itself has **not yet been audited**; background translation could bypass Post locking and state-token checks.
- Prepared read-only local Ubuntu source helper `hakisend-sync-phase2k-http-async-source-audit.sh` to collect strictly allowlisted `TranslateSiteContentJob`, `SiteMultilingualService`, publishing HTTP controller/auth/scope, entitlement service and supporting PHP models/routes from the active HakiSend VPS, without `.env`, database rows or logs. It generates `~/Downloads/hakisend-sync-phase2k-http-async-source.tar.gz`.
- Next Phase 2K: audit translation queue write path and authentic HTTP contract; add same parent row-lock discipline to async Post/Translation writes for enrolled Posts, and build route/controller-scoped authorization/409 tests in isolated Laravel/MySQL. Do not deploy original Phase 2J solely on service-level passing tests.


## Phase 2K audit (15 production PHP files) and isolated async-translation guard candidate

Owner provided `hakisend-sync-phase2k-http-async-source.tar.gz` with current production read-only PHP copies of `TranslateSiteContentJob`, `SiteMultilingualService`, publishing HTTP controller, API authentication/scope/authorization, Sites entitlements, models and routes. Main findings:
- `TranslateSiteContentJob` uses Redis queue `hakisend-sites-translation` and a uniqueness key based on resource type/id/locale, delegating `post` jobs to `SiteMultilingualService::translatePost`. The job does **not** itself hold the parent `SitePost` row lock.
- `SiteMultilingualService::translatePost` uses an AI translation manager and locale job lock. Following potentially long remote translation work, it writes `SitePostTranslation::updateOrCreate` with no guarded parent Post row lock/revision precondition. Its error handler also writes a translation error row and can clobber newer translation status. These are real additional concurrent writer paths.
- Production `PublishingContentController` has the existing Upsert validation/ownership flow, but the proposed `sync` expected-token validation and conflict-to-HTTP-409 mapping still need integration. The auth middleware resolves a bearer token, customer/user identity and token scopes; cross-tenant HTTP tests remain mandatory.

A **Phase 2K isolated MySQL candidate** `hakisend-sync-phase2k-async-translation-guard-tests.tar.gz` was prepared locally by combining Phase 2J.1 service tests and the new production sources. A new `PublishingAsyncPostTranslationGuard` snapshots the canonical token before an AI call, then locks and re-checks the same parent Post within a short transaction immediately before writing either a successful translation or error status. It rejects stale versions and opt-in enrollment during an in-progress old job, preserving legacy un-enrolled Post behavior. An adjusted `SiteMultilingualService::translatePost` calls the guard in both success and failure paths; other resource translation methods are not modified. The test harness verifies this guard on isolated MySQL with simulated AI delay/interleavings, **not actual translation provider/billing/queue execution**.

Static checks on the candidate passed: 35 PHP files syntax-checked with PHP CLI, Bash syntax PASS, 39 SHA-256 manifest entries PASS. **Docker MySQL runtime not yet run for Phase 2K; do not claim 2K PASS.** User is to run `--check` and `--run` locally on Ubuntu and share output. There is no production deployment or migration in Phase 2K.

Next release blockers remain: true queue/AI/billing transactional integration; `markStaleForSite` and other Post writer paths; authenticated HTTP 409/401/403 and cross-tenant tests; read-side Posts API/changes feed; full schema migration/release+rollback verification; mobile touch-first and email campaign workflows remain future development.


## Phase 2K 58/58 PASS and Phase 2L read-preview candidate (2026-10-10)

The owner executed the isolated Docker MySQL Phase 2K candidate: `TESTS_PASSED=58`, `RESULT=ASYNC_GUARDED_MYSQL_TEST_PASS_WITH_RELEASE_BLOCKERS`, `PRODUCTION_CHANGED=NO`, and temporary MySQL container/network were removed. Fresh async translations succeeded; stale success and failure markers after changes to Post, Tags, Translations, or managed enrollment were rejected. The test did **not** run real AI provider or Laravel queue/billing and reported `APP_HTTP_ROUTING_TESTED=NO` and `GLOBAL_CONFLICT_SAFE_TWO_WAY_SYNC=NO`.

To prioritize a usable **HakiSend → Obsidian preview/import** before two-way sync, Phase 2L test candidate was prepared outside this GitHub repository as `hakisend-sync-phase2l-read-preview-mysql-tests.tar.gz` (SHA-256 `c03f124aead98f1f53d99a549e6ebc86c5043990cc45f901743bdb9ab6ff85dd`). Its additive read routes are:
- `GET /api/v1/hakisend/sites/{siteUid}/posts` — metadata-only, bounded (limit 1–100) paginated bootstrap scan with per-Site maximum ID captured in cursor. Not a complete immutable snapshot or incremental feed.
- `GET /api/v1/hakisend/sites/{siteUid}/posts/{postUid}` — same-Site detail; verified original Markdown if source provenance is intact, or explicitly HTML/read-only if source is missing/diverged, plus a canonical state token for later controlled use.

The candidate applies **existing** PublishingApiHardening, PublishingApiAuthenticate and `content:read` scope middleware; the read controller also restricts customer ownership and entitlement. Read service integration tests on isolated MySQL cover pagination and fixed high-water ID, tenant-scoped queries and cursors, invalid cursors, faithful Markdown, HTML fallback, deleted Post exclusion and state token. Phase 2K prior service tests are retained.

**Status:** package PHP/Bash syntax and SHA256 checks passed locally (41 files). **Phase 2L MySQL integration has NOT yet been run**; full HTTP 401/403/404 and cross-tenant token authorization still require a live isolated Laravel HTTP harness. Neither read endpoint is deployed. Source-provenance and state-token migrations are not present in production. There is no run.sh --apply. The Posts `/changes` API remains deferred until a reliable change/event journal covers Post, Tag, Translation, soft deletion/restoration, including updates in the same clock second. No publication, email, or write API modification from Phase 2L.


## Phase 2L.1 Docker packaging fix — awaiting rerun (2026-10-10)

The owner executed the Phase 2L isolated Docker MySQL run. Existing async/managed writer assertions and the new read-side service assertions passed through `read_deleted_not_listed`. Final static route declaration assertions failed **in the test harness** because `integration.php` read `__DIR__.'/routes.php'` but `Dockerfile` omitted `COPY routes.php ./routes.php`; `file_get_contents` returned `false`, causing `substr_count()` to throw a TypeError. This is **not evidence of production HTTP/API failure**; production has not received these new routes.

The revised candidate `hakisend-sync-phase2l1-read-preview-packaging-fix.tar.gz` adds that Docker COPY statement and an explicit `--check` preflight assertion. The supplied source `routes.php`, read controller/service and integration test logic are otherwise unchanged. Local `bash -n`, PHP lint and SHA256 checks over 41 files PASS. **The Phase 2L.1 MySQL run has not yet occurred**, so do not claim the HTTP tests or the integration suite have passed. The existing HTTP authorization and complete incremental-sync release blockers remain.


## Phase 2L.1 73/73 MySQL PASS; Phase 2M isolated HTTP auth boundary prepared (2026-10-10)

User confirmed Phase 2L.1 isolated Docker MySQL: TESTS_PASSED=73, RESULT=READ_PREVIEW_AND_ASYNC_SERVICE_MYSQL_TEST_PASS_WITH_RELEASE_BLOCKERS, PRODUCTION_CHANGED=NO, temporary test network/container removed. Post read bootstrap metadata, Site-scoped pagination cursors, exact stored Markdown/source-fidelity, HTML-only fallback and soft-delete hiding all passed; static route and content:read declarations passed. The test explicitly reported POST_READ_AUTH_HTTP_TESTED=NO and APP_HTTP_ROUTING_TESTED=NO.

Prepared Phase 2M candidate hakisend-sync-phase2m-isolated-http-auth-tests.tar.gz, adding a test-only Illuminate Router pipeline with the real PublishingApiAuthenticate and PublishingApiScope middleware, PublishingApiTokenService and PublishingApiToken model, PublishingPostReadController and PublishingPostReadService. It creates synthetic Customer/User tables and tokens exclusively in temporary Docker MySQL; simulated allowed/denied customers use a test subclass of SiteEntitlementService, because the full HakiSend app is not installed. Intended test cases: 200 list/detail, 401 missing/invalid/expired/revoked bearer, 403 insufficient scope/entitlement, cross-tenant Post/Site rejection, 404 unknown Posts, no-store, malformed limit validation. Existing 73 service regression checks remain in the same run.

Scope limit: this is a local Illuminate Router/request/response integration, NOT a boot of the production HakiSend application kernel, real externally served HTTP, original hardening middleware rate limit/audit/error translation, or full customer subscription entitlement policy. This package passed local php -l for 39 PHP files, bash -n, and 43 file SHA256 checks, but Phase 2M MySQL HAS NOT yet run. Nothing was deployed; preview routes remain candidate only.

Release blockers: full authenticated HakiSend application/kernel and production plugin route tests, migration rollback, sync change-feed, actual queue/hardening, version locking all writers, and an Obsidian preview/import UI. Start with read-only preview/import release; no bidirectional auto-merge.


## Phase 2M.1 isolated Router harness fix (2026-10-10)

Owner ran Phase 2M on isolated Docker MySQL. Read-service assertions passed, including safe Markdown, HTML fallback, pagination, Site isolation and deletion. **Before any HTTP-specific PASS**, the first synthetic Illuminate Router dispatch threw bare Symfony HttpException. The isolated runner did not bind the current \`Illuminate\Http\Request\` instance into the Container as the real Laravel HTTP Kernel does; controller dependency injection could therefore see a fresh Request with no auth/customer attributes, and its \`abort_unless\` would reject it. This is a **harness hypothesis/diagnosis, not evidence of a production auth defect**.

Prepared Phase 2M.1 \`hakisend-sync-phase2m1-http-request-binding-fix.tar.gz\`: before each synthetic dispatch bind the same Request to both the \`request\` Container key and Request class; add exception status/class diagnostics only, without printing tokens. No business code, controller, auth middleware, migrations, database schemas or production files changed. PHP syntax, Bash syntax, SHA256 manifest, archive readability passed locally. **Docker MySQL Phase 2M.1 has not yet run; do not claim it passed**. The harness still isn't a full Laravel production HTTP Kernel integration.


## Phase 2M.2 88/88 isolated HTTP PASS; Phase 2N read-only deployment baseline (2026-10-10)

The owner ran the isolated Docker MySQL test after two **test-harness-only** corrections: (a) bind the same Illuminate Request into the local Container before Router dispatch and (b) check Cache-Control directives rather than assuming string equality to "no-store". The resulting full suite passed with TESTS_PASSED=88, RESULT=HTTP_AUTH_BOUNDARY_AND_READ_MYSQL_TEST_PASS_WITH_RELEASE_BLOCKERS, and PRODUCTION_CHANGED=NO. Both temporary MySQL container/network were removed.

New HTTP PASS assertions: correct read token 200, metadata-only list, no-store/private, missing/invalid/expired/revoked bearer 401, write-only token 403, cross-tenant Site blocked, entitlement denial 403, markdown Post detail 200 with no auto-write guarantee, unknown/cross-Site Post 404, invalid list page-size rejected. The real PublishingApiAuthenticate / PublishingApiScope / PublishingApiTokenService / PostReadController and MySQL tokens were exercised, but in an **isolated Illuminate Router + synthetic Customer/User/entitlement stub**, not in the production app/kernel or PublishingApiHardening. Do not infer production readiness from 88/88.

Next strategy: first deploy narrowly scoped **read-only Post preview** (list and detail) with rollback and a verified baseline, rather than mixed two-way sync release. The production source schema might lack hakisend_site_post_sources and enrollment; a first read-only adapter can return HTML-only fallback when no trustworthy original Markdown exists. Never synthesize writable Markdown from HTML, and never enable managed writes by implication.

Prepared Phase 2N **read-only remote production readiness** script hakisend-sync-phase2n-production-readiness-audit.sh. It SSHes into the existing HakiSend app, reads exact allowlisted source SHA-256 fingerprints, plugin/version information, registered API routes, and only database INFORMATION_SCHEMA table/column/index metadata. It emits no raw user content, token, .env, credentials or Post rows and runs no migrations or cache-clearing commands. Its purpose is to detect production drift and whether a zero-migration HTML preview path is needed **before** constructing a staged release/rollback package. Bash syntax checked; not yet run by owner. Deployment is NOT authorized on the evidence of this report alone: require full app route/hardening checks and opt-in controlled rollout.


## Phase 2N production baseline reviewed; Phase 2O zero-migration preview candidate (2026-10-10)

User supplied Phase 2N read-only report (RESULT=PHASE2N_READ_ONLY_AUDIT_FINISHED; PRODUCTION_CHANGED=NO_CHANGES_REQUESTED), identifying PHP 8.3.33 and Sites plugin v0.15.3. The **real production schema does not contain** hakisend_site_post_sources or hakisend_site_post_sync_enrollments; Post content is longtext HTML. There is no current read-side Posts API. Production routes.php SHA256 f97f4811703dde7650847767e072255efeae8470ee0bde5da84afe4325d8dade matched the previously obtained full routes source **exactly**.

Created Phase 2O isolated candidate package hakisend-sync-phase2o-zero-migration-read-preview.tar.gz (SHA256 43ee26645bbc9fcd2a93731756089ef621883c7aef3ca1d5544837cccc1aeffa; local static checks PASS). Its **read-only release overlay** has exactly five PHP files: the original production routes.php with one controller import + two authenticated, content:read scoped GET routes, the PublishingPostReadController, PublishingPostReadService, PublishingPostSourceService, and PublishingPostRevisionService. The source/revision services now explicitly check Schema::hasTable('hakisend_site_post_sources') before access; when absent, the detail returns original stored HTML strictly read-only with editable_source_available=false and roundtrip_safe=false; a computed token is informational and does not authorize mutation. No migration, post write controller, publisher, AI translation or managed enrollment is included.

A candidate isolated MySQL runner (derived from Phase 2M.1, including its verified current-Request container binding + non-strict Cache-Control directive test) adds five assertions AFTER existing HTTP tests: missing source table, HTML-only fallback, valid informational state token without source table, HTTP GET returning HTML read-only, and GET-only scoped routes. **NOT YET RUN by owner on Docker**, so do not claim Phase 2O runtime PASS. Local php -l/Bash lint and SHA256 manifests passed. The overlay is not a deploy script; no production changes were made.

Before deployment, require exact baseline drift gate, backup, isolated running HakiSend app/kernel tests of hardening + actual entitlement, preview with a narrowly scoped read bearer, GET-denial smoke tests and rollback rehearsal. Backend Phase 2O alone cannot reconstruct Markdown for existing Posts; Obsidian must label them as HTML-only, never auto-overwrite vault notes, and sanitize rendering of untrusted HTML. Two-way sync and incremental event feed remain separately gated.


## Phase 2O isolated test harness correction (2O.1; 2026-10-10)

User ran Phase 2O Docker/MySQL successfully through Phase 2M baseline HTTP checks and the three new source-table-absent assertions: phase2o_source_table_absent, phase2o_missing_source_table_returns_html, phase2o_missing_source_table_has_snapshot_token. The run then stopped at integration.php line 739: Undefined variable $dispatch; Error: Value of type null is not callable. The prior HTTP test helper had been named $http and declared at line 650, so the new Phase 2O test used an undefined helper. This is a test-harness-only error; it is NOT evidence of a production API defect. No Phase 2O full-suite PASS can yet be claimed.

Replaced the erroneous call with the existing $http(siteUid, plainToken, "posts/{postUid}") helper, changed the final integration result marker to explicitly say PHASE2O_ZERO_MIGRATION_READ_PREVIEW_MYSQL_TEST_PASS_WITH_RELEASE_BLOCKERS, added check-phase2o-test-contract.sh to detect this helper mismatch during preflight, and regenerated the SHA256 test manifest. Packaged as hakisend-sync-phase2o1-http-helper-fix.tar.gz. Local PHP lint and Bash/manifest checks PASS. Docker/MySQL runtime NOT executed for the corrected Phase 2O.1 package. Production unchanged; no release authorized until true full-kernel and live HTTP rollback-gated validation.


## Phase 2O.1 93/93 MySQL PASS and Phase 2P production stage-only release gate (2026-10-10)

User confirmed Phase 2O.1 isolated Docker MySQL/Illuminate Router: TESTS_PASSED=93, RESULT=PHASE2O_ZERO_MIGRATION_READ_PREVIEW_MYSQL_TEST_PASS_WITH_RELEASE_BLOCKERS, PRODUCTION_CHANGED=NO; containers and MySQL network removed. Five zero-migration fallback assertions passed (source table absent; HTML-only return; informational snapshot token; HTTP HTML read-only; GET-only routes). Full production HakiSend application/kernel, hardening rate-limit/audit, real customer subscription authorization and production routing were **NOT** tested.

Prepared \`hakisend-phase2p-read-preview-release-gate.tar.gz\` to transition toward production **without live deployment**. SHA256: \`d89250104d84fd2e1446cd6d791efa9a3af58e335d9ecb4de83511656a4d8302\`. Only deployment payload: original production routes.php (one controller use + exactly two scoped GET routes appended), PublishingPostReadController, PublishingPostReadService, PublishingPostSourceService, PublishingPostRevisionService. No migration and no write API changes. The package has exactly two SSH actions:
- \`bash run.sh --check\`: read-only baseline gate against verified Sites v0.15.3, PHP 8.3.x, production SHA-256 of routes.php, PublishingContentController, auth/scope/hardening middleware, and SitePost model; ensures all four new classes are absent; no writes to live plugin.
- \`bash run.sh --stage\`: repeats baseline check, copies verified five-file overlay into **root-only** \`/root/hakisend-phase2p-read-preview-stage/work/payload\`, then checks strict tar path allowlist, SHA256, PHP syntax on VPS. No live-plugin file changes, Artisan commands, migrations, cache clearing, route registration, production DB writes, or publication.

Local verification: payload SHA256 PASS, PHP/Bash syntax PASS, strict route diff checks original routes retained and only two GET routes added. A separate fake local production fixture (with exact original hashes) passed baseline read check, stage verification, and intentionally corrupted routes hash correctly triggered \`RESULT=PHASE2P_GATE_BLOCKED\`. Important limitation: this fixture uses PHP 8.4 locally so the PHP 8.3 version gate was bypassed **in the fixture only**; the shipped script continues to enforce PHP 8.3.x, which the prior Phase 2N production report confirms.

**Owner has NOT yet run Phase 2P on VPS.** Do not call the staged payload deployed or the HTTP routes live. After a green stage report, verify actual HakiSend autoload/route/cache/hardening and customer entitlement integration, prepare backup + one-command rollback, obtain user approval, then run a deliberately limited real HTTP live smoke test. Existing HTML is still read-only/non-round-trip-safe; do not overwrite Obsidian vault notes with it.


## Phase 2P stage PASSED on production and Phase 2Q integration/rollback preflight prepared (2026-10-10)

Owner executed Phase 2P against actual Sites v0.15.3 / PHP 8.3.33: all six production checksums matched. Default SFTP-based scp failed ("Connection closed"), but the owner used the existing working SSH connection to stream the payload archive to the isolated stage and then invoked the original verified remote-gate.sh stage_verify. The latter PASSED: STAGED_PHP_FILES=5, NEW_GET_ROUTES=2, MIGRATIONS_EXECUTED=NO, PRODUCTION_PLUGIN_FILES_WRITTEN=NO, RESULT=PHASE2P_STAGING_VERIFIED_LIVE_UNCHANGED. Staged candidate path is /root/hakisend-phase2p-read-preview-stage/work/payload; NOT deployed.

Prepared Phase 2Q script hakisend-phase2q-integration-rollback-gate.sh (SHA256 30379c248595b9b6e36f5b2054209d147f8cef167136d8981f093470400aa2fc). Owner should run via existing SSH alias stdin (ssh -T -o BatchMode=yes hakisend 'bash -s -- check' < script then rehearse). Check: re-verify 6 production baseline SHA values, exact staged checksums and 5 PHP syntax, report route-cache presence, Composer PSR4 metadata, root Composer autoload availability, flag that full HTTP kernel is NOT exercised. Rehearse: copy production routes to a root-owned temporary mock tree, apply staged five candidate files in the mock tree, compare, restore original mock routes and remove candidate mock classes; verify resulting mock matches production. No writes to live plugin or production DB. Does not call Artisan. A local mock fixture built from the same production source archives passed both check and rehearse; the actual VPS Phase 2Q test has NOT yet been run. Dynamic plugin runtime loader may be distinct from root Composer loader: a reported NO_PLUGIN_RUNTIME_REQUIRED is not itself a release-blocking defect.

After Phase 2Q VPS PASS: still require an explicit gated production activation plan with backed-up routes, fail-closed real app kernel checks and rollback, authenticated read-only GET smoke test using least-privileged token, no raw HTML injected into Obsidian. Never claim these API GET routes are live before deployment and route smoke verification.


## Phase 2Q actual VPS PASS; Phase 2R Laravel kernel gate and route backup prepared (2026-10-10)

User ran Phase 2Q check and rehearse directly over SSH on the real HakiSend VPS. Both PASSED: six production baseline checksums unchanged, Sites v0.15.3 composer namespace recognized, route cache files zero, staged route appended without replacing existing API writes, MOCK_ACTIVATION_VERIFIED=YES, MOCK_ROLLBACK_VERIFIED=YES, LIVE_PLUGIN_CHANGED=NO, MIGRATIONS_EXECUTED=NO. The original root Composer loader did not itself resolve dynamic plugin classes (reported ORIGINAL_PUBLISHING_CLASS_RESOLVED=NO_PLUGIN_RUNTIME_REQUIRED); this is not proof of a runtime defect. No live API new routes were activated.

Prepared Phase 2R single-file hakisend-phase2r-kernel-backup-gate.sh, SHA256 e63f131b87c66150e27171b21732141140bd21c0bc24c63f03104524b969c501 (local Bash syntax and five inline PHP lint checks passed; actual VPS run NOT yet performed). Run from Ubuntu via existing working SSH alias with ssh -T -o BatchMode=yes hakisend 'bash -s -- check' < script; after PASS, run mode backup. It performs exact six production SHA checks, staged SHA, five PHP syntax checks, no active route cache, then boots HakiSend's actual console Laravel Kernel using php artisan route:list --json --path=api/v1/hakisend/sites, asserts original publishing API routes and names are present and new preview routes still absent, and independently boots the console kernel and checks the original publishing controller class via dynamic plugin autoload. Backup additionally creates/verifies the original production routes.php backup at /root/hakisend-phase2r-read-preview-route-backup/routes.php, outside application/plugin tree. Fails closed on mismatch, no deployed code changes, no migration, cache clearing or Post writes. Laravel console/kernel validation is not an authenticated live HTTP request.

Next release decision: only after Phase 2R actual VPS success, assemble an activation and one-command rollback gate with pre/post exact hashes, auto-rollback on failure and a least-privileged content:read live HTTP smoke test before beginning Obsidian read preview UI. Actual deployment requires clear user acknowledgment of live code modification.
