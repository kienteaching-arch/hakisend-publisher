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
