# R3 Email Only pinned pre-send source attestation

This change addresses a concrete user-facing mismatch: the user may edit the
Obsidian Markdown AFTER a native Acelle NEW Campaign was created. Without an
additional readback, the plugin might send the older Campaign email while
displaying the newer local text.

## New blocking contract

In the *pinned* Email Only Send Now/Schedule workflow, immediately before
persisting a delivery request or sending any POST:

1. Read the active Standalone Email Plan, verify exact Site, Draft UID/revision,
   List, campaign UID and source note path.
2. GET the existing HakiSend Sites Private Draft by UID. Verify exact
   request_uid, list_uid, subject, preheader, revision and **whole Markdown
   body**, plus private/non-sent status.
3. GET the original Publisher promotion receipt by the **persisted**
   promotion request UID; verify Acelle Campaign UID, NEW state, and
   non-scheduled/non-sent flags.
4. Read the Vault note again and fail if it changed during the two GETs.
5. Only when every check passes continue to existing backend native preflight,
   per-Campaign one-shot request identity and explicit user's send/schedule
   authorization.

If a GET fails (e.g. the List was revoked), the send is blocked. The plugin
does NOT retry the source POST, promotion POST or delivery POST. The source
email can be re-reviewed and re-promoted manually after resolving the
inconsistency.

## Scope

- Reuses the existing Sites GET Draft API and Publisher GET promotion receipt.
- Adds no server endpoint, no automatic email action or policy override.
- Existing unpinned R3 native delivery command remains unchanged.
- Requires backend Promotion read to be enabled on staging; cannot run with all
  flags OFF.
- CI uses existing source suite plus new contract tests and full plugin build;
  real Laravel/Acelle staging and account 0.1.9 compatibility remain open.

**NO production deployment or real email send.**
