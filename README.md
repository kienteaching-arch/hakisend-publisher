# HakiSend Publisher

Publish Markdown notes from Obsidian to HakiSend.

HakiSend Publisher connects an Obsidian vault to a HakiSend Site so you can write locally, save drafts, schedule Posts, and publish without copying Markdown into a browser editor.

> **Release status:** This branch contains a **0.1.36 review candidate**, not an approved Community Plugins release. Its canonical source is now JavaScript at `src/runtime/main.js`; the former TypeScript source is retained for historical reference and is not part of the build. Read [release readiness and blockers](RELEASE_CANDIDATE_0.1.36.md) before installing or redistributing it. The general Website authoring documentation below was written for the earlier public release; commands and capabilities in 0.1.36 also include Email workflows.

## Requirements

- Obsidian 1.11.4 or later.
- A HakiSend account.
- Access to at least one HakiSend Site.
- An internet connection for HakiSend operations.
- Some HakiSend features may depend on the service plan associated with your account.

## Account and network access

HakiSend Publisher requires a HakiSend account for publishing features.

When you connect, save, upload media, schedule, publish, or disconnect, the plugin communicates with the HakiSend API over the network.

Email drafting, campaign preparation, and explicit Send/Schedule actions also communicate with HakiSend's server. The plugin may open the HakiSend Website + Email Calendar in a browser; the server calendar is not currently displayed as one native Obsidian calendar grid.

Creating new Facebook publishing operations is disabled in candidate 0.1.36; saved historical plan data is preserved. No new Facebook API posting is provided by this candidate.

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

The canonical source for 0.1.36 is `src/runtime/main.js`. It is a readable JavaScript runtime snapshot from the UAT package; it includes bundled code and is not a restored modular TypeScript project. Use the following commands to copy that source to the Obsidian runtime entry point, and verify exact byte parity:

    npm run build
    npm run verify-build
    npm test

For edit-and-refresh development:

    npm run dev

The previous `src/main.ts` remains in the repository only as an earlier implementation reference. `esbuild.config.mjs` intentionally refuses to run, preventing an accidental rebuild that would overwrite the new runtime with old code. Future JavaScript changes must be made in `src/runtime/main.js`, followed by `npm run build` and tests. A modular source refactor can follow later without changing the shipped behavior.

The candidate's frozen runtime checksum and non-mutating contract tests can be checked with:

    node --check main.js
    node scripts/check-candidate.mjs
    node --test tests/*.test.cjs

## Releases

For a public release, the plugin version must agree in manifest.json, package.json, and versions.json. Version metadata now agrees for 0.1.36, but live UAT and Obsidian policy acceptance gates in the release checklist are not yet complete.

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
