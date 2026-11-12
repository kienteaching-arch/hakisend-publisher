# Technical reference — archived README from 0.1.44

> This is an archive of the README as it appeared before the public-facing user guide was rewritten on 2026-11-12. Some status statements and version references are historical and may be outdated. Use the repository's current README for installation and normal use.

# HakiSend Publisher

Publish Markdown notes from Obsidian to HakiSend.

HakiSend Publisher connects an Obsidian vault to a HakiSend Site so you can write locally, save drafts, schedule Posts, and publish without copying Markdown into a browser editor.

> **Release status:** 0.1.44 is a **local mobile UI improvement candidate**, not yet published or Community-approved. It builds on 0.1.43. The user verified one Email Only send on Android with 0.1.43 on 11 November 2026; that does not validate the changed 0.1.44 calendar and schedule screens. Before releasing, review the source diff, run the complete tests, upload matching `main.js`, `manifest.json`, and `styles.css` as GitHub Release assets, and perform on-device UAT.

## Requirements

- Obsidian 1.11.4 or later.
- A HakiSend account.
- Access to at least one HakiSend Site.
- An internet connection for HakiSend operations.
- Some HakiSend features require a paid service plan. An account is required for publishing and email operations.

## Account and network access

HakiSend Publisher requires a HakiSend account for publishing features.

When you connect, save, upload media, schedule, publish, or disconnect, the plugin communicates with the HakiSend API over HTTPS (default `https://app.hakisend.com`; your configured HakiSend endpoint may differ). Custom API URLs must be valid HTTPS origins without paths, queries or credentials. Invalid saved URLs remain visible for correction, but block authenticated API requests. The server receives the content, attachments and metadata needed for the action you explicitly request.

OAuth connection secrets use Obsidian Secret Storage. Tokens saved by older versions in the plain `bearerToken` setting are **never used for API requests** in 0.1.41: reconnect via the browser to replace the old credential, then revoke it in HakiSend if applicable. Never share your vault's local `data.json` or export an access token when requesting support. This plugin does not include client-side telemetry or ads.

Email drafting, campaign preparation, and explicit Send/Schedule actions also communicate with HakiSend's server. The **Content calendar (Website + Email)** opens inside Obsidian and uses a read-only API to show server-confirmed Website dates and native Acelle Email Campaign statuses. It was verified with HakiSend PublisherEmail 0.6.28. If the selected server does not support this contract, the UI explicitly warns that Email Calendar is unavailable and falls back to Website dates. Local plans are never labeled as sent or published. A native Campaign status of `done` is not a guarantee that a message reached the recipient's Inbox.

Creating new Facebook publishing operations is disabled in 0.1.41; saved historical plan data is preserved. No new Facebook API posting is provided by this version.

Your Markdown source remains in your Obsidian vault. Publishing operations send the content and metadata required for the requested HakiSend operation.

## Commands

Open the Obsidian Command Palette and search for **HakiSend Publisher**. Obsidian supplies the plugin name, so commands no longer repeat the “HakiSend” prefix.

The default command list is deliberately limited to ten end-user actions:

- Connect account
- New website post
- Choose site for note
- Edit post details
- Save post
- Publish post now
- Schedule post
- Create email from published post
- Email — create or continue
- Content calendar (Website + Email)

Experimental contract probes, diagnostics and low-level recovery commands are hidden by default. They remain available for technical support through **Settings → HakiSend Publisher → Lệnh kỹ thuật nâng cao**, followed by a plugin restart.

Connection controls are available in the HakiSend Publisher settings.

## New Post

HakiSend: New Post creates a local Markdown draft before anything is sent to HakiSend.

A new Post begins with Properties similar to:

    ---
    title: My Post
    status: draft
    category: business
    external_id: 00000000-0000-4000-8000-000000000000
    ---

The UUID above is only an example.

The real external_id is generated once and provides the stable identity between the Obsidian note and its HakiSend Post.

Renaming the file, moving it to another folder, or changing its title does not require a new external_id.

## Edit Post Properties

HakiSend: Edit Post Properties manages:

- title
- slug
- Category
- Tags
- excerpt

It does not regenerate external_id.

## Categories

The selected HakiSend Category is stored explicitly in the note Properties.

Moving the Markdown file to another folder therefore does not silently change its HakiSend Category.

## Tags

Tags are synchronized to HakiSend when the Post is saved.

HakiSend may create Tags required by the Post during the Save workflow.

## Site language

The current Post publishing workflow uses the default locale configured for the selected HakiSend Site.

Translation publishing is not currently exposed through HakiSend Publisher.

## Save Changes

HakiSend: Save Changes creates or updates the current Post in HakiSend.

Saving does not create a new Site publication.

A draft may be saved even when its Markdown body is still empty.

## Schedule

HakiSend: Schedule saves the Post and then performs the HakiSend publication operation required for the schedule.

Local scheduling Properties are committed only after the server operation succeeds.

## Publish Now

HakiSend: Publish Now saves the current Post and publishes the resulting Site state.

Local publishing Properties are committed only after the publication succeeds.

Publish Now also clears obsolete schedule values that would conflict with an immediate publication.

## Images

Supported local Markdown image references can be uploaded through HakiSend Media during the Save workflow.

The published Markdown then references the resulting HakiSend Media asset.

## Errors

When an API request fails, the plugin displays the HTTP/API error in Obsidian.

When supplied by HakiSend, the request ID is also displayed so the server-side request can be traced.

## Manual installation

Create this directory inside your Obsidian vault:

    <Vault>/.obsidian/plugins/hakisend-publisher/

Place these release files inside it:

    manifest.json
    main.js
    styles.css

Restart Obsidian or reload Community plugins, then enable HakiSend Publisher under Settings → Community plugins.

Do not copy another user's data.json or plugin connection state.

## Development

The canonical source for 0.1.41 is `src/runtime/main.js`. It is a maintained, readable JavaScript runtime bundle with the relevant module names and comments; it has not yet been refactored into independent TypeScript modules. Use the following commands to copy that source to the Obsidian runtime entry point and verify exact byte parity:

    npm run build
    npm run verify-build
    npm test

For edit-and-refresh development:

    npm run dev

Future JavaScript changes should be made in `src/runtime/main.js`, followed by `npm run build` and tests. The GitHub release asset `main.js` must match this build byte-for-byte. A modular source refactor can follow later without changing behavior.

The release's frozen runtime checksum and non-mutating contract tests can be checked with:

    node --check main.js
    node scripts/check-candidate.mjs
    node --test tests/*.test.cjs

## Releases

For a public release, the plugin version must agree in manifest.json, package.json, and versions.json. These files agree for 0.1.41. The earlier 0.1.40 desktop Website + Email UAT, native Content Calendar backend checks, Sites 0.15.38 security post-update and cross-Customer authorization checks passed. The 0.1.41 desktop runtime and mobile platforms have not undergone a separate end-to-end acceptance run. Obsidian's Community source/build review has not yet been completed.

versions.json maps each plugin version to the minimum compatible Obsidian version.

A GitHub release uses the exact version number as its tag, for example:

    0.1.0

Release assets are:

    manifest.json
    main.js
    styles.css

## License

HakiSend Publisher is released under the MIT License.

See LICENSE.
