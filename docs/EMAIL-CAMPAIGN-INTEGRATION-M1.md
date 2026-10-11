# HakiSend Email Campaign integration — Phase Email M1 (2026-10-11)

## Owner-approved semantics

The Obsidian publisher has two **distinct email types**.

1. **Post-linked free-excerpt email.** Enabled per Post and audience. It follows Post publication **exactly**: Publish Now triggers the email only after the Post becomes truly public; a scheduled Post triggers the email only when HakiSend actually publishes it; a rescheduled Post automatically reschedules its email; failed/unpublished Posts do not send. A subsequent edit or retry must not resend the email. Extract the public excerpt on the SERVER from the same source as the public page; never include premium or member-only content. No independent email clock.
2. **Standalone email.** No Post creation/publication. Recipient list, sender, subject, body, optional preheader, preview/test-send and explicit confirmation. Independent send-now or scheduled send in a timezone-aware timestamp. Email archive is private by default; do not assume storing or sending implies public visibility. No-save option requires separate retention audit before promises about what the mail engine retains.

## Findings from uploaded Acelle installer (NOT runtime production audit)

- app/Http/Controllers/Api/CampaignController.php: standard campaign list/create/update/show, run, pause behind auth:api, declared routes in routes/api.php.
- app/Http/Controllers/Api/MailListController.php: customer-scoped lists with uid/name/sender information. Acelle UIDs can be opaque (uses uniqid()), NOT UUID-only.
- app/Services/Refactor/CampaignService.php: saveSchedule uses Carbon and app timezone; launch invokes validateLaunchPolicy and unsubscribe-URL validation; sendTestForAgent and scheduleSendForAgent are available.
- app/Console/Commands/ExecuteScheduledCampaigns.php: existing campaign:schedule command. Campaign model enforces scheduled run_at and queued-state locking.
- Critical integration detail: the Publishing API Obsidian bearer token is not proven to authorize Acelle core auth:api. **Do not wire browser plugin directly to core Campaign routes without a verified permission/tenant bridge.**
- The uploaded installer does NOT include the installed HakiSend Sites or Membership plugin source. The exact public/free excerpt generation and Post publication hook are unknown until a read-only production audit. Never invent these.
- Because the scheduled-command path uses Campaign::execute, while CampaignService::launch performs unsubscribe prechecks, the backend adapter must ensure the SAME policy/compliance preconditions are checked at schedule acceptance AND before actual dispatch, rather than bypassing the gate.

## What was implemented locally

- Compiled HakiSend Publisher v0.1.6 **test beta only**, based on owner-tested v0.1.5 Read Preview plugin. New Obsidian mobile-friendly ribbon/command to create a Post-linked or Standalone email **local authoring plan** under HakiSend Emails/<site_uid>. New browse-local-plans command. No server writes, sending, or scheduling.
- Post-linked plans mandate sendPolicy=on_publication; standalone plans may choose sendPolicy=now or scheduled with explicit ISO8601 timezone offset stored in UTC. Prevent read-only import snapshots as linked sources, invalid Site IDs and pinned-site mismatch; avoid note overwrite; private archive false and email_dispatch_ready=false by default.
- Unit tests: 14 policy assertions PASS; mock Obsidian integration PASS (7 assertions including preservation of Read Preview and no HTTP); pure future server-dispatch contract tests PASS (16 cases covering after-commit public transition, verified free excerpt, auth, idempotency, and standalone time). Node compiled syntax PASS.
- The pure contract is **NOT** a deployed HakiSend sending backend. Local user documents labelled local_draft are never to be interpreted as confirmed server schedules.
- Bundle intended for HakiSend-Test only. The exact compiled v0.1.5 source remains unmerged on this GitHub branch, therefore the v0.1.6 beta is distributed as an isolated archive rather than silently upgrading src/main.ts in the repo.
- No HakiSend production code or database was modified by developing this candidate. Phase 3A stays staged/not deployed.

## Required next gate: production read-only survey

A bash script hakisend-email-production-audit-readonly.sh examines only route metadata, hashes/versions, verified Campaign schedule method signatures, and candidate Sites/Membership publisher/excerpt filenames. No tokens, subscriber rows, mail contents or production writes. Execute from owner's Ubuntu with SSH alias hakisend; examine output before proposing a source-level integration.

## Backend build steps after audit

1. Verify exact Sites Post publish state machine and free-excerpt source. Define server-authorized list and sender discovery under the scoped Publishing token, without crossing tenant boundaries.
2. Add Post-linked enrollment/association and durable idempotency ledger keyed siteUid+postUid+publicationVersion+listUid; implement an **after-commit and confirmed-public** event hook. Mark declined/failed/sent states; reschedule/cancel unpublished posts before dispatch.
3. Add standalone draft/schedule adapter invoking core Campaign policies, template validation, private-archive policy and authorized audience, with send-now/test-send explicit UI confirmations.
4. Add backend preview, test-send, logging, rate limiting and audit without leaking premium content or recipient PII.
5. Attach plugin sending UI and server-acknowledged Publishing Calendar. Never present a local date as a remotely accepted job.
6. Preserve Phase 3A frozen until the owner separately authorizes its production migration.
