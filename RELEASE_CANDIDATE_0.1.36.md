# HakiSend Publisher 0.1.36 — Community submission candidate (NOT A RELEASE)

This branch is a review checkpoint for the Obsidian Community Plugins submission.
**Do not merge, create a GitHub release, or submit the plugin directory entry yet.**

## Runtime payload

- `manifest.json` (id `hakisend-publisher`, version `0.1.36`)
- `main.js` (runtime bundle from the internal 0.1.36 WEBSITE_EMAIL package)
- `styles.css`

The plugin connects to the user's HakiSend account and sends the user's selected content and metadata to HakiSend when requested. Never commit vault-specific `data.json`, access tokens, credentials, or local account settings.

## Verified in this checkpoint

- Runtime package ZIP integrity and flat root layout.
- `node --check main.js`.
- Three local Node contract tests (Facebook deferred/calendar; manual promotion error handling; Post Notice single-list guard).
- Matching plugin ID and version in the runtime `manifest.json`.
- Canonical JavaScript source `src/runtime/main.js` has the exact byte content of `main.js` and is copied by `npm run build` without introducing bundler changes.
- `npm run verify-build` validates byte-for-byte source/runtime parity; `package.json`, lockfile and `versions.json` agree with the candidate manifest.

These checks do **not** prove full end-to-end behavior against a live HakiSend server, mobile compatibility, or an Obsidian review approval.

The [KIENVU test-vault UAT checklist](docs/UAT_KIENVU_0.1.36.md) and its safe installer are included for owner-operated desktop checks. Their availability does **not** mean installation or live UAT has already happened.

## Open gates before a public GitHub release

1. **JavaScript source quality**: The canonical source now exists and reproduces the runtime byte-for-byte. It is a preserved compiled JavaScript bundle, not reconstituted modular TypeScript. The old `src/main.ts` must stay explicitly non-authoritative and must not overwrite the 0.1.36 build; review code readability and long-term editability.
2. **Server attestation**: Verify protected guest-Free preview on the server before Post Notice email delivery.
3. **End-to-end UAT**: Complete a one-recipient delivery and receipt verification, sync/conflict tests, and check HTML entities/Cloud Sync behavior.
4. **Calendar scope**: The Website + Email server Calendar is opened in the browser; it is not yet a single native Obsidian Calendar grid. Historical Facebook plans remain readable; new Facebook sending is intentionally disabled.
5. **Plugin reviewer QA**: Audit network requests, token handling, device compatibility, UI behavior, settings disclosures, errors, and Obsidian developer-policy compliance.
   - Obsidian's published policies require clear README disclosure of required accounts, network access, possible paid features and any data transmitted to remote services.
   - Determine whether the HakiSend service performs server-side telemetry for this plugin and, if so, provide a working privacy-policy link before submission.
   - Confirm that no code is intentionally obfuscated and that the plugin performs no automatic self-update or remote-code installation.
6. **Release procedure**: Recheck the agreed `manifest.json`, `package.json`, `versions.json`, `README.md` and release assets after all gates are accepted. Only then tag exactly `0.1.36`, attach the three runtime assets, and submit to the Obsidian Community Plugins catalog.

## Provenance

The runtime artifacts were taken from the internal archive `HAKISEND_OBSIDIAN_0.1.36_WEBSITE_EMAIL.zip` dated 2026-11-09. This archive contains executable assets and limited contract tests, **not** matching TypeScript sources. The exact reviewed `main.js` is now preserved verbatim as `src/runtime/main.js`, and the build does a deterministic file copy. This is deliberately documented as a JavaScript source strategy, not a claim to have recovered the original TypeScript. The internal Vietnamese handoff is under `docs/README_VI_0.1.36.md`.

No user data, `data.json`, `.env`, personal tokens, or vault contents are part of this branch.
