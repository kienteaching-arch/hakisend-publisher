# HakiSend Publisher 0.1.41 — Community submission checklist

## Release sources and assets

- Current intended GitHub repository:
  `https://github.com/kienteaching-arch/hakisend-publisher` (**private source**).
- Create a separate public distribution repository containing the four root
  metadata files in `public-repository/` from the handoff, plus GitHub Releases.
- The `repository/` directory in this handoff is a **staging copy**. The
  existing local repo has uncommitted modifications. Review the differences,
  create a dedicated release branch and commit deliberately. **Do not** copy
  this folder over an existing dirty worktree without examining its changes.
- `src/runtime/main.js` is the maintained readable source for this version;
  `npm run build` copies it to `main.js` without altering the shipped code.
- Ensure `npm test` and `npm run verify-build` pass from the repo root.
- Prepare GitHub tag **`0.1.41`**, identical to `manifest.json` version, only after security UAT.
- Attach each binary artifact separately to the GitHub release:
  `main.js`, `manifest.json`, `styles.css`. Do not upload only the outer ZIP
  as the release asset. The separate `github-release-assets/` directory in
  this handoff contains the exact three files.
- Preserve the MIT `LICENSE`, `README.md`, `versions.json`, source and tests
  in the **private source repository**. Publish corresponding public metadata
  in the **public distribution repository**. Confirm the official review app
  has read-only access to the private source.

## Policy gates requiring owner decisions

1. The owner selected **Private** for the canonical development repository.
   Confirm the Obsidian Community directory's private-source review access and
   use a separate public GitHub distribution repository containing the root
   README, LICENSE, manifest, versions map, and the three matching release
   assets. Never expose development history or server code.
2. Confirm the service privacy policy URL and disclose it clearly if HakiSend
   collects server-side telemetry. Do not invent an unverified privacy link.
3. Test a clean Obsidian vault on the intended mobile platforms. If mobile
   is unsupported, change `isDesktopOnly` to `true`, update assets, and run
   fresh acceptance checks before submission.
4. The current JavaScript source is a readable bundle. Obsidian's automated
   source/build check may request a modular authoring-source refactor. Keep
   the exact release/runtime/source parity and do not obscure the source.
5. Confirm the author/license/branding authority and any fees or plan limits
   described in the public README and directory listing.

## Submission route (current Obsidian process)

1. Commit the verified source to the **private** source repository. Publish
   the public metadata files and a matching release with three separate assets
   from the **public** distribution repository, only after UAT passes.
2. Sign in to `https://community.obsidian.md` with an Obsidian account.
3. Link your GitHub account to that directory profile.
4. Add the plugin using the **public distribution repository URL**. Install
   the official Obsidian Community directory GitHub App on the private source
   repo for read-only build/source review. The directory reads the public
   `manifest.json` and GitHub release assets matching its exact version.
5. Resolve errors/warnings without bypassing checks; if code or manifest
   must change, publish a **new version and matching release** before asking
   for re-review.

**No GitHub push, release, listing submission or production vault mutation
is included in this package.**

## Verified scope on 11 November 2026

- Website + Email UAT on Obsidian 0.1.40 with PublisherEmail 0.6.28:
  PASS on desktop. Repeat the desktop smoke test on 0.1.41 before release.
- 1 native Acelle Campaign: `done`, sent logs 1, failed 0, other 0,
  delivery journal `handed_off`, email received.
- Native Content Calendar: API available and a sent Campaign visible in
  KIENOS for November 2026, with no Website-only fallback.
- Static source/build tests: PASS. Mobile and directory review: pending.
- Security hardening 0.1.41: local HTTPS/token regression checks mandatory.
- Sites 0.15.38 deployment and two-Customer negative authorization UAT are
  **pending**; do not claim a release-ready security gate until they pass.
