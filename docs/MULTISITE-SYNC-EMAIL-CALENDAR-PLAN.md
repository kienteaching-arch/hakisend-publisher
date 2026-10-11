# Multi-Site Publishing, Sync, Email and Calendar — Design (2026-10-10)

## Current baseline
0.1.1 supports browser OAuth/PKCE with Obsidian SecretStorage, GET sites, site-specific category lookup, post upsert, publication, image upload, and local schedule Properties. It does **not** have a read-side Posts API in the plugin, content synchronization, email campaign dispatch, or a visual calendar.

## P1 — Multi-Site folder publishing (implemented in this branch)
- Add `folderSiteMappings: [{folderPath,siteUid}]` to plugin settings (backward-compatible empty array).
- Add `folderCategoryMappings: [{folderPath,siteUid,categoryUid,categoryTitle?}]`; each child folder can map to a site-specific category UID, inheriting into arbitrary deeper subfolders. Same Category title may occur on different Sites with distinct UIDs.
- Category resolution priority: explicit `category_uid` in note → legacy explicit `category` slug/name → longest-prefix Category folder mapping (matching resolved Site) → legacy last-folder-name match. Do not choose the first available Category silently during Save. New Post pins both `site_uid` and `category_uid` in Properties.
- Categories are real server entities returned by `GET /sites/:siteUid/categories`; mapping UI requires selecting a Category returned for the selected Site. It refuses to map a child folder to a Site different from its parent Site route.
- Moving a previously published note between Category folders must not silently change the destination Category, because the note pins `category_uid`; user must deliberately select another Category in Edit Post Properties. This matches the legacy invariant of explicit note Category.
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
- Four mapped Site folders publish correctly (parent vs child route precedence). Per-note pin overrides route.
- Each Site supports multiple Category subfolders. Nested subfolders inherit the nearest Category UID mapping; same Category labels across Sites remain isolated.
- Newly created notes pin Site UID and Category UID; editing an existing note pins Category UID. A stale/deleted Category UID fails closed, no silent fallback.
- Stale/inaccessible Site never publishes into fallback Site.
- Save, Edit Properties, New Post, Schedule and Publish Now agree on Site selection.
- Mobile install: connect, save draft and schedule via Obsidian mobile; fallback UI is touch friendly.
- Import all/since now/since date: conflict copies, tombstones, pagination, auth expiry and resumability tested.
- Preview percentage matches email exactly (safe excerpt boundary); zero or duplicate sends after retry; unsubscribe respected.
- Calendar 1/2/3 posts/day counts, filters, timezone boundaries, server discrepancies, offline state tested.
- Deploy with rollback; no production mutation from unreleased development branch.


## P2/P3 addendum — Mobile-first commands and standalone email campaigns (2026-10-10)

### Touch-native mobile controls (required, not a cosmetic follow-up)
- `Ctrl+P`/Command Palette remains a desktop shortcut **only**. All primary actions — New Post, Save Draft, Sync, Preview, Schedule, Publish, Create Email, Test Send, Send Campaign, Campaign Status — must be reachable through touch-sized controls inside an Obsidian plugin view, ribbon/menu or mobile-safe modal.
- Use Site → Category → destination folder pickers with tappable search; no hover-only interactions, keyboard-only instructions, or long desktop forms. Confirm destructive, public or irreversible actions, show progress and retry/queue state, and handle session expiration on mobile.
- Distinguish saving an editable note offline from remotely executing a send/publish action: server confirmation and idempotency are required. No claims of guaranteed background delivery.

### Standalone Obsidian-authored HakiSend email campaigns
- **Independent workflow** from `free_preview_percent` / "send free part of published article". A note can represent an email-only campaign without creating/publishing a Post.
- Author may start a campaign on desktop **or phone**, choose authorized HakiSend audience/list, sender identity, per-Site template, subject/preheader, preview, test send and explicit final confirmation. Respect unsubscribes/suppression, send permissions and auditing.
- Per-campaign setting `store_on_hakisend: true|false`. If `false`, the authoring body and editable archive remain only in the Obsidian vault; HakiSend still needs to process outbound content transiently and retain minimum delivery/compliance metadata/logs as required. Do not promise absolutely zero server retention until backend retention policies are audited.
- If `store_on_hakisend: true`, an additional opt-in `publish_email_archive: true|false` controls whether an email archive is internet-visible. **Default `publish_email_archive: false`**. Save to HakiSend is not a public publication; never infer public visibility from a delivery event.
- `store_on_hakisend: false` implies `publish_email_archive: false`; disable or hide public-archive control. Changing either from false to true requires an explicit confirmation and authorization.
- Proposed frontmatter (pending backend investigation):
```yaml
hakisend_type: email_campaign
site_uid: "<site UID>"
email:
  list_uid: "<list UID>"
  template_uid: "<template UID>"
  subject: "<email subject>"
  store_on_hakisend: false
  publish_email_archive: false
  status: local_draft
```
- A confirmed campaign send must not implicitly publish an email archive nor publish or modify a Website Post; if no archive is stored, the vault's note remains authoritative. The API must expose a short-lived send/dispatch operation with idempotent campaign ID, permissions, and delivery outcome without exposing subscriber data in Obsidian notes.
- If archive publishing is requested, protect recipient-specific links/tokens and private audience details; publish only a sanitized public rendition, never the original recipient-personalized email or subscriber list.
- Keep free-preview email logic separately policy-bound to **public Post publication** and independent from standalone campaigns.

### Required tests
1. Touch-only new Post and email campaign send on Android/iOS: no keyboard shortcut necessary.
2. Standalone email can be sent without publishing a Post, with retry/no duplicate sends.
3. Saved HakiSend email remains **private by default**, across API and public runtime.
4. No-save campaign does not create a content archive, subject to auditable minimum delivery metadata retention.
5. Email archive public opt-in, authorization and stripping of subscriber-specific data.
