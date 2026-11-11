# HakiSend Publisher 0.1.44 — Mobile calendar and email send UI

- Content calendar on mobile now uses two labeled filters and compact month navigation rather than oversized stacked buttons.
- A seven-column monthly calendar keeps date cells tappable; a clearer event card displays each selected day's time, channel, title, site, and status.
- Email Only send confirmation hides raw technical preflight results in the normal workflow. All server checks continue to gate sending; blocked checks display concise actionable messages. Advanced inspection remains separate.
- Scheduled email inputs now have visible **Ngày gửi** and **Giờ gửi** labels, with accessible names and mobile-friendly touch targets.
- No HakiSend backend contract, publishing state transition, authorization scope, or send endpoint has changed.

## Validation

Run `npm run build`, `npm run verify-build` and `npm test` from the repository root. Android UI requires hands-on UAT before considering this release fully verified.
