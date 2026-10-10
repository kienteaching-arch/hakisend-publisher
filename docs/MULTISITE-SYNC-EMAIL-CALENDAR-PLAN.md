# Multi-Site Publishing, Sync, Email and Calendar — Design (2026-10-10)

## Current baseline
0.1.1 supports browser OAuth/PKCE with Obsidian SecretStorage, GET sites, site-specific category lookup, post upsert, publication, image upload, and local schedule Properties. It does **not** have a read-side Posts API in the plugin, content synchronization, email campaign dispatch, or a visual calendar.

## P1 — Multi-Site folder publishing (implemented in this branch)
- Add `folderSiteMappings: [{folderPath,siteUid}]` to plugin settings (backward-compatible empty array).
- Resolve destination: `site_uid` or legacy `site` frontmatter, then longest-prefix vault folder mapping, then default site.
- Validate destination against discovered authorized Sites. A bad explicit UID or stale folder mapping must fail closed rather than redirecting to another Site.
- Create new notes with pinned `site_uid`. Provide command to override/remove per-note pin.
- Use the same resolved UID for categories, metadata and post upsert. Site-specific Categories must be reselected when changing a pinned site.
- **Caution:** A previously published note moved between mapped folders may be published on a new Site; preserving explicit per-note UID avoids accidental cross-site moves. A cross-site Post is not automatically a move of the old Post.

## P2 — Device sync vs. HakiSend content sync (server contract required)
Two different subsystems:
1. Vault sync: transfer Markdown + attachments between desktop and phone using Obsidian Sync or a separately configured vault sync provider; don't use HakiSend to replace a general vault sync engine. Each device must authorize HakiSend independently; NEVER sync OAuth secrets or PKCE state by copying plugin data.json.
2. HakiSend content sync: implement authenticated paginated `GET /sites/:siteUid/posts`, `GET /posts/:postUid`, and incremental change cursor/timestamp + delete/tombstone handling (exact routes TBD from production). User choices: all, from now, or from selected timestamp. Bootstrap direction is explicit: download-only, upload-only, or reconcile.
   - Preserve stable source identity `external.source=obsidian`, `external.id=external_id`, and site UID, post UID, last known revision/ETag/hash.
   - On changes compare base revision, local hash, and server hash; one-sided change syncs; both-sided change makes a conflict copy and offers resolution. Never silently overwrite.
   - Incremental retries and idempotent upserts; avoid body/media duplicates and rate bursts.
   - Site timezone and locale should be represented separately from device-local time.
   - Mobile offline editing queues actions and requires a visible online confirmation before publication. No background delivery guarantee.

## P3 — Free sample and campaigns
In note Properties:
```yaml
free_preview_percent: 35
email:
  enabled: true
  list_uid: "..."
  template_uid: "..."
  send_policy: on_publication
```
- Percent: 0..100 inclusive, fraction by a documented counting rule (prefer readable paragraph/word boundary over raw substring); author can preview and override the exact free excerpt.
- Calculate the free excerpt ONCE on the HakiSend server and render the same result on public site and email. Exclude paywalled text entirely from campaign payload. Email must respect content visibility, permission, opt-in and unsubscribe semantics.
- Campaign dispatch must occur only after a confirmed PUBLIC Post publication and at the intended scheduled time, NEVER on draft/save. Idempotency key `siteUid:postUid:publicationVersion:listUid:policy` prevents duplicate send on retries.
- Server must expose list and authorized templates, editable brand configs, preview/test-send, schedule/send and audit state endpoints. Do not invent these API routes before production inspection.
- Template contains branding variables `{{brand_logo_url}}`, `{{brand_name}}`, `{{site_url}}`, `{{post_url}}`, `{{post_title}}`, `{{free_content_html}}`, `{{register_url}}`, `{{unsubscribe_url}}` (these are proposed names, not current server values).
- Escape text by context and sanitize HTML; constrain URLs; track opt-out state. Branding and sender domain configuration must be per Site.
- Uploaded KIÊN OS example uses dark header with golden headline/CTA, article excerpt, registration CTA, attribution and unsubscribe footer. Extract into editable template regions. The sample's URL and visual design MUST NOT be hard-coded across all Sites.

## P4 — Visual publication calendar
- Month grid with `publish_at` counts displayed as 1, 2, 3 dots (then +N), status distinctions for server confirmed vs local tentative schedules.
- Filters: all Sites / one Site; planned / scheduled / published; timezone selector (default Site locale/timezone).
- Tap a day to show all posts with titles, site, exact datetime and local/server confirmation. Tap article to open note.
- Scheduling modal embeds calendar and marks current article as edited without double-counting.
- Calendar source: merged indexed local frontmatter and authenticated HakiSend list API. Deduplicate by site UID + post UID or external identity. Do NOT imply locally scheduled = server accepted.
- Initial offline calendar may show only local notes with explicit state label; cross-device authoritative calendar requires server read endpoints and sync.

## Acceptance / release gates
- Existing connected user retains OAuth token and default-site behavior on upgrade.
- Four mapped folders publish correctly (parent vs child route precedence). Per-note pin overrides route.
- Stale/inaccessible Site never publishes into fallback Site.
- Save, Edit Properties, New Post, Schedule and Publish Now agree on Site selection.
- Mobile install: connect, save draft and schedule via Obsidian mobile; fallback UI is touch friendly.
- Import all/since now/since date: conflict copies, tombstones, pagination, auth expiry and resumability tested.
- Preview percentage matches email exactly (safe excerpt boundary); zero or duplicate sends after retry; unsubscribe respected.
- Calendar 1/2/3 posts/day counts, filters, timezone boundaries, server discrepancies, offline state tested.
- Deploy with rollback; no production mutation from unreleased development branch.
