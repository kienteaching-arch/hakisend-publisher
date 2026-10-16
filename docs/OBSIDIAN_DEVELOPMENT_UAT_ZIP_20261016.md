# Obsidian Publisher deterministic TEST-VAULT archive — 2026-10-16

**This is not an official release. Do not install in the owner's main Obsidian Vault.**

The actual existing plugin still uses `id=hakisend-publisher` and is built from maintainable TypeScript. The new `scripts/package-development-uat.mjs` builds a ZIP **only after** the standard `npm ci`, full unit contract suite, TypeScript typecheck, Obsidian production bundle compile and compiled runtime reconnect tests. The archive contains exactly these root entries:

- `manifest.json`
- `main.js`
- `styles.css`
- `checksums.sha256` of the three deployable files
- `DEV-UAT-NOT-A-RELEASE.txt` with explicit source/parity/release disclaimers

The ZIP uses only stored, deterministic entries with a fixed DOS timestamp and a verified CRC32; CircleCI runs `unzip -tq`, exact entry allowlist, SHA256 roundtrip, byte-for-byte input comparison and an identical SHA256 after regenerating it.

The local output name is `dist/hakisend-publisher-development-uat.zip`. It is deliberately **not** uploaded to a public GitHub Release or an auto-update feed, not pushed as a checked-in binary, and not marked as owner-approved. CircleCI's passing packaging test proves the *development* ZIP can be reconstructed reproducibly; it does **not** establish full runtime behavior on the owner’s devices.

Current plugin manifest remains `0.1.3`; the owner-tested previous archive was v0.1.9. `scripts/release-provenance.mjs --release` correctly remains blocked until editable source v0.1.9 parity, SHA256 source/bundle provenance, updated and consistent versions and explicit owner release authorization are verified.

Two final artifacts are required for the actual outcome: an official Obsidian Publisher ZIP and an upgraded **existing** `hakisend/sites` ZIP through the Super Admin HakiSend Plugin Manager. This development archive is one prerequisite, not the final pair.

`DEV_VAULT_ZIP_BUILD_TESTED=YES`
`OFFICIAL_PUBLISHER_RELEASE=NO`
`PRODUCTION_SITES_UPGRADED=NO`
