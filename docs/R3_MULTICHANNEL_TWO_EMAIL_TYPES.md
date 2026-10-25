# R3 Multichannel Publishing authoring candidate (local-only)

In Obsidian command palette: **HakiSend: Plan Multichannel Publishing — Posts, Free Emails, Standalone Emails, Facebook (local only)**.

From an editable Markdown note choose the authorized HakiSend Site and one of two modes:

1. **Post**: one Website Post plus optionally several Post Free Emails (one per authorized List, each with independent template reference, subject, preview text and ISO-8601 schedule) and several Facebook Page posts (each with a separate Page ID, name and schedule). To plan a Post Free Email, put exactly one explicit Free block in the source Markdown:

    <!-- hakisend:free:start -->
    The guest-visible article portion.
    <!-- hakisend:free:end -->

   All content outside that region is excluded from Email; this is NOT server attestation of a guest-visible paywall boundary. The backend must independently verify the published Post guest-visible content before sending.

2. **Email Only**: all Markdown body excluding YAML frontmatter; never create a Website Post or Facebook post. Pick one or more authorized Email Lists with separate template references, subject and schedule.

Creates a *local-only* plan under **HakiSend Distribution Plans/{site_uid}/{uuid}.md**. It has four distinct event kinds: site_post / post_free_email / standalone_email / facebook_page_post. Every event contains Site owner UID and exact destination identity, its own timestamp if scheduled and a status `local_draft`.

**Critical boundaries:** no server write, Meta OAuth, Facebook token, provider template lookup, publishing, dispatch, schedule or Calendar mutation. Facebook Pages are typed identifiers pending backend authorization. Template references are NOT resolved/applied by Acelle yet. Staging backend must implement server-verified template selection, per-list Campaign creation, Free boundary attestation, recipient consent and durable provider receipt.

Develop branch only; do not overwrite an installed/owner-tested Obsidian plugin in the primary Vault.

## Local multichannel Calendar
The command **HakiSend: View Multichannel Plan Calendar by Site/Page/List (local-only)** lists the locally saved plan events and filters by Site or one of four content kinds. Each line always includes the Site, the destination (Site, List or named Page), the independent ISO 8601 timestamp and status **LOCAL DRAFT**. It does not claim a server-confirmed schedule or provider delivery. Invalid/mismatched plan documents are excluded and counted.

## Source safety
When a Post contains paid/member content, BOTH Post Free Email and planned Facebook Page previews are derived from the explicitly marked Free block. Standalone Email may use the complete body of an ordinary Markdown note or the actual **Email body** section of an existing HakiSend **standalone** Email Plan; an existing post-linked Email Plan cannot masquerade as Email Only.
