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

These checks do **not** prove full end-to-end behavior against a live HakiSend server, mobile compatibility, or an Obsidian review approval.

## Open gates before a public GitHub release

1. **Source provenance**: Existing `src/main.ts`, build scripts, and `package.json` originate from an older 0.1.x revision. The current 0.1.36 `main.js` is **not** verified as reproducible from repository sources. Recover or reconstruct matching maintainable source and demonstrate a deterministic build before release.
2. **Server attestation**: Verify protected guest-Free preview on the server before Post Notice email delivery.
3. **End-to-end UAT**: Complete a one-recipient delivery and receipt verification, sync/conflict tests, and check HTML entities/Cloud Sync behavior.
4. **Calendar scope**: The Website + Email server Calendar is opened in the browser; it is not yet a single native Obsidian Calendar grid. Historical Facebook plans remain readable; new Facebook sending is intentionally disabled.
5. **Plugin reviewer QA**: Audit network requests, token handling, device compatibility, UI behavior, settings disclosures, errors, and Obsidian developer-policy compliance.
6. **Release procedure**: Bring `manifest.json`, `package.json`, `versions.json`, `README.md` and release assets into agreement. Only then tag exactly `0.1.36`, attach the three runtime assets, and submit to the Obsidian Community Plugins catalog.

## Provenance

The runtime artifacts were taken from the internal archive `HAKISEND_OBSIDIAN_0.1.36_WEBSITE_EMAIL.zip` dated 2026-11-09. This archive contains executable assets and limited contract tests, **not** matching TypeScript sources. The internal Vietnamese handoff is available under `docs/README_VI_0.1.36.md` in the branch.

No user data, `data.json`, `.env`, personal tokens, or vault contents are part of this branch.
