# HakiSend Publisher — unified delivery gates (2026-10-13)

This is an **execution ledger and acceptance plan**, not proof of implementation. All server-side code and tenant data remain outside this public repository.

## Product goal

Obsidian desktop/mobile is the authoring interface. HakiSend is the authoritative Site/Post/Membership/Email server. The product must deliver:

1. **Multi-site Posts** with explicit Site and Category mapping, no silent destination fallback, publication confirmation and media support.
2. **Post-linked free-content Email**: select an authorized MailList and editable Site email template. HakiSend generates the public-safe free portion **from its own Membership/visibility policy**; the email is dispatched exactly once **after the Post is actually public**. A scheduled Post has no independent Email clock. Reschedule/unpublish/cancel must inhibit dispatch.
3. **Standalone Email**: subject/preheader/body/sender/list/template, private by default, preview, isolated test send, explicit send-now and independent schedule. Sending does not publish a Post or public archive.
4. **Publishing Calendar**: one server-aware view of Posts, post-linked Email and standalone Email, with timezone, Site filters, conflicts and accepted-versus-local status; touch controls on mobile.
5. **Explicit bidirectional Markdown sync** after Email + Calendar. Provide Sync All and per-Post selection, compare local/server revisions, preserve conflict copies, never silently overwrite. Phase 3A remains frozen until separately approved.

### Confirmed historical evidence, not current integration proof

- Obsidian Publisher **v0.1.9**: owner-tested test Vault; remote private Draft browse/revision 3. We have the **compiled bundle ZIP**, but no matching editable TypeScript v0.1.9 source in this Git repository.
- HakiSend Sites **v0.15.4**: owner-tested full plugin browser UI and private Draft/Audience support.
- Sites **v0.15.5**: full review-only candidate, promotion feature gate deliberately OFF; no production deployment.
- Acelle M2.9-B Bridge **R4 read-only PASS**. This proves source and renderer compatibility under the isolated M285 fixture, **not** Campaign creation, transaction safety or send authorization.
- The existing GitHub source branch is **v0.1.3** in package.json and manifest.json, and PR #1 is a draft; do not treat that source as v0.1.9.

The owner supplied ZIP SHA256 reference values (verify bytes again before reuse):

| Artifact | SHA256 |
| --- | --- |
| Obsidian compiled v0.1.9 test Vault ZIP | `2157b02948bd7d39c5f34cca198f7b85af5b1c793b667c93e58b9aa86d7293d2` |
| Sites full installed-baseline v0.15.4 ZIP | `12066836801931d807a6d81236af8624e6170db695f0f493d253b8c0ac13b8e9` |
| Sites v0.15.5 review-only disabled ZIP | `69d6fd918d4ff2ac6b951d8836ec4f41ecdf9571c9ec548b76b6506659ef6dba` |

## Delivery stages

| Stage | Acceptance evidence | State |
| --- | --- | --- |
| A — Source reconciliation and CI | Restore v0.1.9 behavior to editable source; check compiled output and regression; block old-package release | **Started**; guard and tests are in this branch |
| B — Private Draft to Acelle Draft | Isolated real Laravel/MySQL creates exactly one Campaign `STATUS_NEW`, `run_at=NULL`, correct Customer/List/Template/Email, with concurrency, rollback, quota, sender, cross-tenant and ambiguous recovery verified | **Not yet proven** |
| C — Post-linked Email | Membership-derived safe HTML equals guest-visible free slice; due reconciler checks actual public state; editable template; no send before publication, after cancellation or on retries | **Not yet implemented** |
| D — Standalone send and unified UI | Explicit `email:send` approval, test recipient only for test-send, suppression/footer checks, server acknowledgement, desktop/mobile | **Not yet implemented** |
| E — Publishing Calendar | Server-accepted state, due/reschedule/cancel, Post-linked follows Post, DST/timezone, offline tentative vs confirmed | **Not yet implemented** |
| F — Explicit sync | Markdown fidelity, CAS revisions, all/selected import, conflict copy, tombstones, local/remote confirmation | **Paused until Email + Calendar** |

### Critical invariant for post-linked Email

A Site publication snapshot may include future Posts. A future `publish_at` can make a Post public through visibility evaluation **without generating a new publish event**. Therefore a publish webhook alone is insufficient. HakiSend needs a **server-owned due reconciler**, re-checking guest-visible Post state and the Membership free-content boundary immediately before dispatch. Email must never be built from unverified `SitePost.excerpt` or member-only HTML.

## Release and repository controls

- GitHub builds are developer builds; **no GitHub action deploys production**.
- `scripts/release-provenance.mjs --release` must fail until owner-tested v0.1.9+ editable source, compiled artifact checksums and explicit release authorization have been reconciled. The source/reconciliation manifest must be reviewed; never set its approval flag automatically.
- Backend Sites/Acelle source remains outside this **public** repo. Develop and CI-test it in a **private** workspace/repo with synthetic data; never upload production `.env`, credentials, customer content, subscriber data or backend code here.
- Changes to production Sites plugins require a **complete full-plugin ZIP** via **Refactor Admin → Plugins → Install/Upgrade**, based on current verified baseline. Never SSH-copy code to live plugin. Migrations require separate approval and backup.
- Test mode may **not** call `Campaign::launch`, `execute`, `saveSchedule` or queue a real delivery. Remain `STATUS_NEW` and `run_at=NULL` in the Acelle Draft gate.
- Phase 3A remains paused until Email and Calendar are accepted.

## Next development gate

1. Securely recover v0.1.9 **editable** source if it exists; if only compiled `main.js` exists, treat that as a *behavioral reference* and port changes to source with regression tests. Do not rename or copy a compiled file as TypeScript.
2. Build a single isolated M290 Laravel/MySQL test suite from the verified private Sites/Acelle code. No changes to M285 or production; no real mail dispatch.
3. Complete the Post-linked free-content/template/due-time vertical slice and test it across public/free/protected Posts, future publish/unpublish, duplicate triggers and audience changes.
4. Add Calendar, then return to explicit bidirectional sync.

The CI checks introduced by this branch establish a **source safety gate only**, not Email/Calendar/Sync integration completion.
