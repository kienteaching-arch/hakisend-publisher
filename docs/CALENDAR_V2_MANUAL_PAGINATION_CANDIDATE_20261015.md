# Calendar v2 — manual read-only paging candidate

Date: 2026-10-15. Draft PR only. **Not installable, not UAT-complete, no production changes.**

The existing v1 Calendar command remains available. A separate Command Palette command, **HakiSend: View Paged Calendar v2 (read-only candidate)**, now displays a selected Site's Calendar through explicit user-triggered GET requests. It uses `GET /api/v1/hakisend/sites/{siteUid}/calendar/pages` from the unmounted backend candidate. The backend deliberately returns 503 until the original plugin lifecycle and source schema are reviewed.

- **Load first page** clears the current session and reads exactly one page.
- **Load More** appears as a separate user action: no background polling, automatic pagination, sending, publishing, Vault reading/writing or state overwrite.
- Each page is bounded at 100 events, checked against the strict `hks_calendar_v1` authoring status/source contract and versioned `hks_calendar_v2` continuation fields. Cursor syntax, stable Site and initial `as_of_utc_ms`, replay/duplicate identity and continuation availability are verified before display.
- The OAuth bearer remains in the Authorization header. The signed cursor belongs in the GET query and is revalidated by the Laravel server against owner, Site and expiry; it is not a grant of rights to new Sites or Subscribers.
- A linked Draft never becomes scheduled from its Post's authoring clock. Native Campaign delivery status, real public Site visibility, hot send quota and legal marketing permission are **not attested** by Calendar.
- A failed later page does not mutate the backend or erase earlier verified pages in memory. Changing Site clears the session, and an in-flight response from a previous Site cannot update the new view.

Regression tests are in `tests/paged-calendar-contract.test.mjs`; the normal Node22 source-test/TypeScript/dev-build CircleCI workflow covers the client. PHP/MySQL8 route, cursor/HMAC, foreign owner and OAuth checks remain in the separate Backend Draft PR.

**Known release blockers**: v0.1.9 editable TypeScript parity with the owner's tested Obsidian bundle, Desktop/Mobile UI UAT, backend Calendar source/version reconciliation, true scheduling and provider receipts, Admin Plugin Manager install/rollback and explicit owner approval. CI success alone is not these approvals.

No send-now, test-send, schedule mutation or manual Markdown sync is enabled by this feature. `PRE_UAT_RC_READY=NO`.
