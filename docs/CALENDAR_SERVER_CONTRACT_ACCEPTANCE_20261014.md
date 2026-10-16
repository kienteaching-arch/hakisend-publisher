# Unified Calendar real-backend read contract — 2026-10-14

**Status:** Development-only, not an Obsidian UI integration or production package.

## Contract and tested behavior

Private Laravel backend Draft PR #2 contains the read-only, feature-disabled
`UnifiedCalendarReadCandidate` / `UnifiedCalendarReadController` with
OAuth-scoped, owner-restricted GET. The response contract is
`hks_calendar_v1`: `data.site_uid`, `as_of_utc_ms`, `read_only=true`,
`truncated`, `events`.

Public Publisher Draft PR #2 now includes
`src/calendar/server-calendar-adapter.ts`. It does not fetch data by itself;
it verifies an **already authenticated** response before projecting through
`buildUnifiedCalendar`.

- Accepts only the expected owner-selected Site, contract version, server
  confirmed status, read-only payload and valid event types/timestamps.
- Explicitly requires `sendAuthorized=false`; no untrusted client status
  or newly invented delivery permission is projected.
- Strips extra fields from backend JSON and rejects cross-Site, duplicate,
  unsupported or implausible records.
- Keeps Post-linked Campaign **draft** unscheduled even if its linked Post
  has a future publication clock.
- Preserves server `truncated` for an eventual page loading UI. A truncated
  Calendar **must not** be presented as exhaustive history.
- IANA timezone localization happens only after server UTC timestamps
  have passed validation.

CI: `tests/server-calendar-adapter.test.mjs` checks 10 isolated cases.
GitHub Actions on commit `aeb8f88d0dba8238132da469831e83241e079a8f`
**PASS**, including source contract tests, TypeScript check and development
plugin bundle.

## Still required before release

1. Wire the owner-authorized Sites API reader into Obsidian (desktop/mobile)
   with explicit Site selection, pagination, error and offline indicator.
2. Reconcile owner-tested v0.1.9 Publisher behavior with editable TypeScript
   and validate against its real compiled bundle before packaging.
3. Replace authoring-only Post visibility with **verified live Site
   publication**; distinguish draft Post from published event.
4. Add genuine Email sending/scheduling and receipts before claiming an
   event is deliverable. No Calendar output is send authorization.
5. Finish Calendar paging/cursors over all record types, multi-Site
   filtering, time windows, deduplication, reschedule and cancellation.
6. Complete standalone sends and Phase 3A explicit two-way Markdown sync,
   UI decisions and server CAS integration.

**RELEASE_AUTHORIZED=NO. PRODUCTION_CHANGES=NONE.**
