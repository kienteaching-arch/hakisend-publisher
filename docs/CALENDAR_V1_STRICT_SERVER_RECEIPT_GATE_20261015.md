# Calendar v1 read-only integrity tightening — 2026-10-15

This is a manually opened, read-only Calendar viewer from owner-scoped HakiSend backend; its current contract NEVER attests sent Email, provider receipts, activated scheduling, real public visibility or send permissions.

The publisher now only accepts actual statuses the v1 backend can emit: Post draft/scheduled/published/ambiguous (authoring clock only); Standalone draft/ambiguous/cancelled; Post-linked Email draft/ambiguous. It rejects sent, scheduled, failed and published Email states until a future versioned contract includes verified provider/scheduler receipts. A scheduled Post must have one consistent scheduledAtUtcMs and postPublishAtUtcMs; no other Post state may invent a scheduledAtUtcMs.

Calendar responses also reject unexpected envelope/snapshot PII fields and fields belonging to a different event kind. All email schedule times remain null in the current v1 contract. No production API/DB route or scheduling action is enabled, and this must not be marketed as a working scheduling integration. Node 22 TS, parser and synthetic tests gate any release.
