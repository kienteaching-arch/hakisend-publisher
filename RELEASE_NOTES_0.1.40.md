# HakiSend Publisher 0.1.40 — Community directory candidate

This is a prepared release candidate, **not** evidence that Obsidian has
reviewed or approved the plugin. The desktop UAT was completed in an isolated
HakiSend-Test vault on 11 November 2026.

## Highlights

- Website Post authoring with editable Excerpt and local draft identity.
- Private HakiSend Email drafts, promotion to native Acelle Campaigns,
  explicit send/schedule approval and exact server-side delivery preflight.
- Email preflight parity: all 10 checks, including Membership Guest Free
  excerpt evidence, gate confirmation. Uncertain send responses use read-only
  receipt recovery; the plugin never automatically resends a Campaign.
- Read-only combined Website + Email Content Calendar, with server-confirmed
  timestamps and native Campaign states. Local plans remain separate.
- Facebook publication actions remain deferred, preserving historical plans.

## Observed acceptance evidence

- Obsidian runtime SHA-256:
  `df2d0d22505497b075b5ad8602187c9a478d8d0b7e6227132dc43dda376f60a3`
- Exact runtime/source byte parity and static security tests PASS.
- Backend PublisherEmail `0.6.28` was installed and the Calendar month view
  stopped reporting HTTP 422. The native email sent on 11 November appeared
  in the calendar with state “Sent in HakiSend”.
- For that native Campaign, HakiSend Delivery Activity showed status `done`,
  one native sent tracking log, zero failed logs, zero other logs, and the
  delivery journal `handed_off`; the test email was received. This does not
  prove Inbox delivery for other recipients or campaigns.

## Limits

- A HakiSend account, network connectivity and server capabilities are
  required. Certain services can require a paid subscription.
- `isDesktopOnly` currently remains false in the tested manifest. A separate
  mobile-platform UAT is recommended before publicly claiming mobile support.
- This source is a readable canonical JavaScript runtime bundle, not a fully
  modular author-maintained TypeScript tree. Build verification reproduces
  the binary exactly via `npm run build`; the directory reviewer may request
  further source-structure improvements.
- Community directory policies, service privacy disclosure and external
  GitHub release submission must be completed independently.
