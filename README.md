# HakiSend Publisher

Publish Markdown notes from Obsidian to HakiSend.

HakiSend Publisher connects an Obsidian vault to a HakiSend Site so you can write locally, save drafts, schedule Posts, and publish without copying Markdown into a browser editor.

## Requirements

- Obsidian 1.11.4 or later.
- A HakiSend account.
- Access to at least one HakiSend Site.
- An internet connection for HakiSend operations.

## Account and network access

HakiSend Publisher requires a HakiSend account for publishing features.

When you connect, save, upload media, schedule, publish, or disconnect, the plugin communicates with the HakiSend API over the network.

Your Markdown source remains in your Obsidian vault. Publishing operations send the content and metadata required for the requested HakiSend operation.

## Commands

Open the Obsidian Command Palette and search for HakiSend.

The authoring commands are:

- HakiSend: New Post
- HakiSend: Edit Post Properties
- HakiSend: Show Local Status
- HakiSend: Save Changes
- HakiSend: Schedule
- HakiSend: Publish Now

The development branch also includes these explicit, opt-in Email authoring commands:

- HakiSend: Create Email Plan (local-only)
- HakiSend: Browse Local Email Plans (Vault only)
- HakiSend: Save Standalone Email as Private Draft (NOT sent)
- HakiSend: Browse Private Email Drafts (read-only)
- HakiSend: Inspect Native Acelle Email Schedule (GET only)
- HakiSend: Inspect Acelle Send/Bounce Evidence (GET only)
- HakiSend: Reconnect with Email Draft Access (NOT send)

**Email Plan** creates a local Markdown note under `HakiSend Emails/<Site UID>/`.
A Standalone Email may record an independent future send intention; a
Post-linked Email references an editable Post and uses `on_publication`
intent, not a separate send time. Neither action actually schedules or sends.
Opening an Email Plan never synchronizes it automatically.

The separate **Reconnect with Email Draft Access** requests exactly
`email:read` and `email:compose` in addition to standard Publishing scopes.
It validates the server's scope response and Site-readability BEFORE
replacing an existing OAuth token, and restores the old token if activation
fails. The connection does not request `email:send` or `email:schedule`.

The **Inspect Native Acelle Email Schedule** command reads only the currently
open Standalone Email Plan with its pinned `site_uid` and previously verified
`hakisend_acelle_campaign_uid`. It sends one authenticated GET; it cannot
schedule, cancel, send or change local Markdown. The diagnostic checks the
native Acelle status against a Site-scoped server ledger but **never**
confirms delivery, provider acceptance or a verified Calendar timestamp.
The corresponding Backend route is deliberately unmounted, so the command
will report unavailable until authorized staging integration exists.

The **Inspect Acelle Send/Bounce Evidence** command reads one owner-scoped
Acelle Campaign, with a separate confirmed Site-to-Campaign ledger association.
It reports local Acelle sent, failed, duplicate and unique bounce/complaint
tracking counts, never email addresses, message IDs or raw provider payloads.
If Acelle shows sending events while the internal intent is only reserved or
cancelled, the UI warns about an unresolved handoff conflict. **An Acelle
`sent` tracking record is not proof of inbox delivery or a provider handoff
receipt.** There is no automatic Vault edit, queue, send or Calendar
confirmation. Both Backend diagnostic endpoints remain feature-OFF and
unmounted until staging UAT and owner-approved installation.

**Important:** These new features are only in development Draft PR #2.
The maintained editable TypeScript source has not yet passed complete
owner-tested v0.1.9 parity, desktop/mobile UAT, or release packaging. Do
not treat the GitHub development build as a released installer.

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

Install dependencies:

    npm install

Build the production plugin:

    npm run build

The production build creates main.js from src/main.ts.

## Releases

The plugin version is defined in manifest.json and package.json.

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
