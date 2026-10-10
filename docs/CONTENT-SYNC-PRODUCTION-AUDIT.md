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
