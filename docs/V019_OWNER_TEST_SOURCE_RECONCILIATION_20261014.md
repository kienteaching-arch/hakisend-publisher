# Owner-tested Obsidian v0.1.9 provenance and forward-port gate

Date: 2026-10-14. **Development only. Not a release. No production change.**

## Independently recovered source evidence

The owner's previously uploaded Library file
`hakisend-obsidian-v019-draft-management-test-vault.zip`
has been materialized and byte-verified:

- Full test vault ZIP SHA256:
  `2157b02948bd7d39c5f34cca198f7b85af5b1c793b667c93e58b9aa86d7293d2`
- `source/main.js` SHA256:
  `0e1e0f9935f401eeaf5c2510edac69df7de0f4ea2c87a36b158a32bd77f`
- Archive contains `source/private-draft-management.cjs`,
  `tests/management.cjs`, `tests/unit.cjs`,
  `tests/obsidian-auth-reconnect.cjs`, a build script and runnable
  bundled v0.1.9 plugin under `dist/`.

**Critical:** this archive does NOT include the matching complete editable
TypeScript v0.1.9 tree. The GitHub plugin baseline remains v0.1.3, and no
release-provenance gate may treat this archive as a substitute for reconciling
the source behavior. Do not bump `manifest.json` to 0.1.9 simply because the
old compiled bundle exists.

## v0.1.9 behavior inventory

| Behavior demonstrated by owner-tested ZIP | Editable TS status |
| --- | --- |
| Explicit local Standalone Email Plan parsing | Pure contract exists, not yet connected to full save UI |
| Manual POST / PUT private Draft with stable request UID and exact CAS revision | Pure mutation adapter exists; integration/recovery still required |
| HTTP GET read-back before local saved status/callout | Pure verifier exists; UI integration still required |
| Read-only browse remote private Drafts with on-demand preview | Implemented as explicit Site-scoped command on Draft PR #2; test Vault UI parity pending |
| HTTP 409 conflict side-by-side local/server Markdown; optional acknowledged revision-only adoption | Pure `canAdoptRevision` exists, UI integration still required |
| OAuth reconnect, multisite mapping, New Post, publishing workflow | Existing TS baseline preserved; complete v0.1.9 parity not yet proven |
| No send/schedule/background pull or post-linked Email dispatch | Explicitly preserved; no new send, scheduler, import, Vault overwrite |

The current public repository contains **only the Publisher client**, never
the private Laravel mirror. The owner-tested ZIP's compiled artifacts must not
be copied into editable `src/main.ts` or falsely labelled a complete port.

## 2026-10-15 — Editable TypeScript parity advances (NOT release-ready)

The exact owner-uploaded v0.1.9 ZIP was independently re-read in the working
container. ZIP SHA256 remains
`2157b02948bd7d39c5f34cca198f7b85af5b1c793b667c93e58b9aa86d7293d2`.
Original `source/main.js` includes the local Email Planner and the opt-in
`reconnect-email-draft-access` flow, which the v0.1.3 TypeScript baseline did
not expose.

This Draft branch now has a maintainable forward-port rather than copying or
renaming any compiled v0.1.9 artifact:

- `src/email/local-email-planner.ts`: editable local Standalone and Post-linked
  Email Plan normalization, explicit ISO 8601 timezone, Vault-path validation,
  safe YAML serialization, local-only status and two no-send policies. The
  `src/main.ts` command palette, modal, note browser and ribbon are wired.
- `src/email/email-connect-scope.ts`: exact Publishing OAuth scope proof and
  separately opt-in `email:read` + `email:compose` evidence; rejects
  `email:send`, `email:schedule` and unexpected rights.
- `src/main.ts`: explicit Email Draft reconnect on the command palette and
  Settings, PKCE `email_access_requested=read_compose` only when chosen,
  new-token Site GET before replacing the old credential, and rollback of
  previous Secret Storage token/settings if activation/discovery fails.
- `tests/local-email-planner.test.mjs`,
  `tests/email-connect-scope.test.mjs`, and
  `tests/runtime-email-reconnect.test.cjs` exercise contract parity,
  scoped token safety and the actual compiled Obsidian development plugin.
  Runtime tests are required AFTER compiling `main.js` in CircleCI.

**Not yet established**: complete component-by-component v0.1.9 runtime
equivalence, on-device Desktop/Mobile owner UAT, real OAuth server consent,
native Email provider test/send scheduling and receipts, Calendar mutations,
manual two-way sync, production admin installer safety, and an owner-authorized
release. The repository manifest/package remain intentionally at v0.1.3.
Do not set `COMPLETE_EDITABLE_V019_PORT_VERIFIED=YES` on these candidates
alone, and do not distribute this development bundle as v0.1.9.

## Required next gates

1. Port each behavior into maintainable TypeScript with recorded regression tests,
   then test on both desktop and mobile against the owner-tested Vault.
2. Confirm API scopes, OAuth revocation, stale readback, ambiguous POST, offline
   behavior and safety boundaries with an isolated tenant.
3. Implement actual Email send/receipts and authoritative Calendar separately
   in the private Laravel repo; never infer delivery permission from client UI.
4. Enable manual Sync All / Selected Markdown only after Email and Calendar are
   accepted; require backend state-token CAS and on-disk backup.
5. Full owner UAT plus explicit release approval are prerequisites for packaging.

`OWNER_TEST_SOURCE_SHA_VERIFIED=YES`
`COMPLETE_EDITABLE_V019_PORT_VERIFIED=NO`
`RELEASE_AUTHORIZED=NO`
`PRODUCTION_CHANGES=NONE`
