# HakiSend Publisher 0.1.42

## Community directory review fixes

- Shorten the plugin manifest description and remove the redundant platform name.
- Rename the canonical bundled JavaScript source so clean-build scanners cannot confuse it with the generated `main.js` release artifact.
- Remove an unused `builtin-modules` development dependency.
- Preserve the security-hardened 0.1.41 runtime, including the HTTPS-origin and legacy-token protections.

## Notes

- No HakiSend production data, mail queues, scheduled campaigns or customer accounts are changed by this plugin release.
- Existing users can update in place once Community directory review completes.
- CSS specificity recommendations and vault enumeration are acknowledged; they are not scanner errors.
- Mobile behavior was not exercised as part of this release.
