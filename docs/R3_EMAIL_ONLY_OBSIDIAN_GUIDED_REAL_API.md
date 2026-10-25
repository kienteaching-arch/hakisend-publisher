# R3 Email Only — integrated Obsidian workflow

Development-only branch; do **not** install over the owner's v0.1.9 production Vault plugin.

## New native commands

1. **HakiSend: Email Only — Import Current Markdown and Start Workflow (R3)**
   - From an independent Markdown email, choose the connected HakiSend Site, authorized Email List (retrieved from the actual Sites Draft API), subject and preview text.
   - Copies the **complete** source body, excluding YAML frontmatter, into an existing `HakiSend Emails/{site_uid}/Email - ...md` Standalone Email Plan with `## Email body`. The original note is never overwritten. Source Post, Free/Paid markers, snapshots, imports, and dynamic template tokens are blocked.
   - Local-only action: creates exactly one note; no Post, Campaign or mail provider write.
2. **HakiSend: Email Only — Continue Draft, Acelle Campaign, Delivery (R3)**
   - Shows exact Site, List, subject, verified Draft/Campaign status.
   - Opens the **existing** explicit confirmation dialogs for Sites Private Draft (POST + GET readback), Publisher Acelle Campaign NEW promotion (POST + GET receipt), and native readiness (GET).
   - Delivery is **pinned to the verified Campaign UID** in that Email Plan, never any selectable Campaign. Server preflight is required and the end-user must approve Send Now or Schedule once. Existing request-journal persistence and GET-only recovery still apply.

## Critical integration gates

- **Not an actual staging acceptance pass.** All workflows use concrete API adapters; they need Sites 0.15.12 and Publisher 0.6.10 with approved OAuth/feature flags in **isolated staging** before live execution.
- The new commands add no new endpoints, no automated send, no stored Meta/OAuth tokens in notes, no Facebook post and no server calendar claim.
- If a Draft or Campaign creation has an uncertain persisted request ID, the guided UI hides creation and points to **GET-only** recovery instead of offering another POST. Persisted delivery journal means receipt only.
- Existing `r3-native-email-delivery` general command is unchanged (unpinned mode). Every pinned send checks the active Plan, Site and Campaign identity again before persisting and POSTing.
- **Known limitation:** recovery of a pending Private Draft request by index and native multi-list/template campaign creation are not yet completed inside the guided UI. Do not delete/reuse request identity after a failed response.
- Current development plugin version is **0.1.3** and has not passed parity comparison with owner-tested 0.1.9; a green CI alone must not be called production ready.

## Operator path

Import standalone Markdown → Open saved Standalone Email Plan → Step 1 Save Private Draft → reopen guided workflow → Step 2 Create unsent Acelle Campaign → reopen guided workflow → Step 3 inspect backend readiness → Step 4 native pinned Send/Schedule after explicit approval → recover GET receipt if needed. Each mutation requires backend flags/roles on an isolated staging tenant.

Production flags and VPS are unchanged.
