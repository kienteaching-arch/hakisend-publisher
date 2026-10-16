# M2.9 Obsidian Publisher — Private Draft Markdown parser and conflict recovery repair

**Date:** 2026-10-16 (VN time). **Draft PR only**, no production mutation, no installer.

## Verified bug in the editable TypeScript integration

Three paths in `src/main.ts` used the RegExp literal `/^## Email body\\\\s*$/im`. That matches a backslash followed by the letter `s`, not the whitespace after a real Markdown heading. The earlier `parseStandalonePlan` used the correct `/^## Email body\\s*$/im`. Therefore a genuine HakiSend Private Draft could be stored remotely but the subsequent local readback/receipt write would be falsely rejected. The same issue was present in local conflict-check handling. A fourth path (promotion receipt) used the correct regex but independently duplicated the parser.

All four integration paths now invoke `extractStandaloneEmailBody` in `src/email/private-draft-contract.ts`. It recognizes the same Markdown body as the plan parser and supports LF/CRLF, refusing malformed headings. New source tests prohibit the double-escaped integration from recurring.

## Hardened manual 409 recovery

The prior UI already offered a comparison modal; this change does **not** falsely claim the feature was missing. It now shows both local/server subject in addition to Markdown, and its explicit acceptance:

1. Reads the same remote Draft again through authenticated owner/Site scope.
2. Rejects a changed UID, revision, **body** or **subject**, even if a server mutation failed to increment the revision.
3. Allows the user to choose or manually merge local Markdown during review; it does **not** choose or overwrite Markdown.
4. Marks a generated local 'Saved' badge as a **manual conflict / unsaved** warning before advancing the local CAS revision. Local `hakisend_remote_email_status` becomes `conflict_reviewed` so native Campaign Draft promotion cannot mistake the old local content for a verified current Private Draft.
5. Requires a new explicit user-driven Save with normal CAS and fresh server GET readback before restoring `private_draft` status.

If local metadata update fails after the warning badge is changed, it remains fail-closed: the note does not claim success, and the user must inspect the current server revision. There is no automatic retry, send, Vault synchronization or silent Markdown overwrite.

## CI and UAT

Files include `src/email/manual-conflict-adoption.ts`, `tests/manual-conflict-adoption.test.mjs` and the existing `src/main.ts` and `tests/private-draft-contract.test.mjs` support. Regression cases cover normal heading parsing, malformed headings, same-revision content drift, duplicate revision selection, preservation of the author's local content and invalid/unchanged revision. The normal CircleCI Node22 TypeScript/build tests must PASS on **the exact new HEAD**.

**Unresolved before release:** Owner-tested v0.1.9 complete source parity, real Obsidian Desktop/Mobile UAT, staging owner/Site OAuth support, Email delivery with verified marketing consent, native provider handoff/receipts, Calendar write workflows, explicit two-way Sync All/Selected, Admin Plugin Manager package and rollback testing.

Release status: `SOURCE_PARITY_COMPLETE=NO`, `UAT=NOT_COMPLETE`, `PRODUCTION_CHANGES=NONE`.
