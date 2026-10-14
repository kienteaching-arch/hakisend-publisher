# Pre-UAT integration gate — HakiSend Publisher / Email / Calendar / two-way Markdown sync

Date: 2026-10-14. Status: **ACTIVE DEVELOPMENT, NOT A RELEASE**.

## Product completion contract

A single owner-tested desktop/mobile Publisher must be able to select a
HakiSend tenant Site and Category; publish/update Posts; create and browse
Private Standalone Email Drafts; explicitly test-send / send-now / schedule
an authorized campaign; create a Post-linked Email which may dispatch only
after a server-owned due reconciler verifies the Post is actually guest
visible; display a server-authoritative consolidated Calendar; and allow
explicit **Sync All** or user-selected per-Post **two-way Markdown sync**
with conflict preview and backup, never silent pull/overwrite.

## Source provenance (independently verified actual ZIP bytes)

Owner-tested Obsidian v0.1.9 test vault ZIP:
SHA256 `2157b02948bd7d39c5f34cca198f7b85af5b1c793b667c93e58b9aa86d7293d2`.

It contains `source/main.js` (SHA256
`0e1e0f9935f401eeaf5c2510edac69df7de0f4ea2c87a36b158a32bd77f`),
the `private-draft-management.cjs` component and its tests, plus a
compiled Obsidian artifact. It does **not** provide a complete corresponding
**editable TypeScript v0.1.9 source tree**. Current GitHub TypeScript
Publisher sources still identify as v0.1.3. Do not copy the compiled
v0.1.9 file into `src/main.ts`, rename versions or falsely mark provenance
reconciled. Preserve the source gate until a matched TypeScript port is tested.

## New implementation candidates on this branch

- `src/calendar/unified-calendar.ts`: pure, timezone-aware Post /
  Post-linked Email / Standalone Email Calendar grouping. Correct UTC-to-IANA
  local-day grouping (including DST), server-confirmed versus tentative,
  blocked states, standalone schedule independence, linked Post clock and
  advisory collisions. Never schedules/sends.
- `src/sync/manual-markdown-sync-plan.ts`: explicit Sync All / selected
  Post planner; baseline state token and checksum reconciliation, Site-scoped
  identity, conflict preservation and no implicit write, delete or HTML→MD.
  Server CAS support is required before it can even **propose** a push.
- Node 22 tests in `tests/unified-calendar.test.mjs` and
  `tests/manual-markdown-sync-plan.test.mjs`, plus existing Email contract
  and provenance tests. CI builds the dev bundle but **withholds release
  packaging** absent source reconciliation and owner authorization.

**Implemented in this development iteration (NOT UAT):** a manually opened,
Site-scoped read-only Private Draft browser with on-demand plain-text detail;
manual Standalone Email Draft POST/PUT with stable persisted request UID,
revision preflight, fresh HTTP read-back and guarded local saved status;
read-only HTTP 409 Markdown comparison plus acknowledged revision-only
adoption; and a manually refreshed Site-scoped Calendar view consuming the
`hks_calendar_v1` OAuth candidate GET contract. Calendar data never grants
Email send authority. These views still need real plugin/runtime UAT.

**Not yet implemented**: Sync All/per-Post menu and selection workflow,
local backup/restore, server-installed Calendar endpoint (a real MySQL8
route candidate exists but its feature flag is OFF), lossless change-feed
and tombstones, a production-authorized conditional update route, actual
send-and-schedule service, full v0.1.9 TypeScript parity, or an approved
production installer.

## Backend reference

Private repository:
`kienteaching-arch/hakisend-backend-integration`,
Draft PR #2: `work/mirror-laravel-bootstrap-20261014`.

Real Laravel/Acelle/Sites/Membership/MySQL isolated CI has verified
Guest Email Preview and user-triggered unscheduled Acelle Campaign Draft,
tenant guards, idempotency, rollback and OAuth scopes.
`src/Sync/ConditionalPostUpdateCandidate.php` is a new feature-OFF
CAS **internal** candidate and currently under separate real MySQL CI.
It is NOT an installed two-way write API.

## Hard release blockers

1. Reconcile v0.1.9 actual working behavior into editable TypeScript,
   repeat desktop and mobile original regression tests.
2. Finish genuine standalone send / test-send / scheduling, independently
   approved scopes, quota/compliance/verified sender, and send receipts.
3. Build a server-owned due reconciler for Post-linked Email; no send
   based only on a publication webhook or snapshot containing future Posts.
4. Implement and tenant-authorize server Calendar read/query and safe
   scheduling mutations; validate DST, cancellation, reschedule,
   simultaneous changes and no phantom scheduled items.
5. Add server-enforced conditional Post update using latest `state_token`
   and trustworthy Markdown source provenance; audit Tags/Translations
   writers' parent-row locking, read pagination/change-feed, tombstones.
6. Integrate UI with explicit Sync All, per-Post selection, preview/diff,
   on-disk backup, read-back verification and conflict copies.
7. Complete owner-verified full Sites plugin ZIP using EXISTING Admin Plugin
   installer/update/rollback, after trusted signing, migration/backup and
   staging QA. No SCP into production.
8. Owner approval and UAT on an isolated tenant with fake recipients,
   revocation/expiry and full workflow recovery.

## Release decision

`PRE_UAT_RC_READY=NO`. `PRODUCTION_CHANGES=NONE`.
`SEND_AND_SCHEDULING=DISABLED`. `TWO_WAY_SYNC_WRITES=DISABLED`.

No workflow shall publish a downloadable installer or label the build
final until all eight gates are demonstrated on matching source and
explicitly approved by the owner.
