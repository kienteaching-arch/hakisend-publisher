# HakiSend Publisher 0.1.41 — Community release candidate

## Changes

- Fail closed unless the configured HakiSend API URL is a plain HTTPS origin:
  no HTTP, credentials, query, fragment or subpath.
- Preserve invalid old settings visibly for correction without sending any
  authenticated request to them.
- Remove the legacy `bearerToken` fallback from API credential retrieval;
  only Obsidian Secret Storage can authorize a network request.
- Keep existing PKCE state/challenge/one-time exchange and explicit Email
  Send/Schedule user consent. Neither scope is silently elevated.
- Add regression coverage for insecure API origins and legacy bearer handling.

## UAT / rollout

- No production Site, Campaign, mail queue, token or account was modified while
  building this candidate.
- Reconnect any legacy token through the HakiSend browser authorization flow.
  The old token must be revoked server-side separately if still valid.
- Pair with HakiSend Sites 0.15.38. The Sites security post-update and
  two-Customer read-only authorization UAT completed successfully. Disabled-User,
  delivery replay, and mobile runtime checks were not conducted in this release cycle.
- Never interpret a native Campaign `done` result as proof of Inbox delivery.

## Status

**Submitted for Obsidian Community review once the public release and private
source are linked.** Approval by Obsidian is not implied. Supported desktop
flows were exercised with the preceding 0.1.40 client; the 0.1.41 hardening was
validated through source-level checks and Sites cross-Customer security UAT.
