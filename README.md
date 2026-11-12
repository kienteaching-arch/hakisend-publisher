# HakiSend Publisher

**Write in Obsidian. Publish to your HakiSend websites and email audiences.**

HakiSend Publisher helps creators, writers, and businesses prepare content in Markdown, keep their notes in Obsidian, and send the finished work to HakiSend when they choose.

## What you can do

- **Publish website posts:** Write locally, choose a HakiSend Site and category, edit the title, excerpt, tags and other post properties, then save, publish or schedule.
- **Create Email Only campaigns:** Draft an email independently of a website post, choose recipients and send immediately or schedule it.
- **Turn published posts into emails:** Prepare email content from an existing published post.
- **See your content calendar:** View website and email activity across HakiSend Sites in one read-only calendar, with a mobile-friendly layout.
- **Use images from your notes:** Supported local Markdown images are uploaded to HakiSend Media as part of the save workflow.
- **Work on desktop or mobile:** Use the same Obsidian Command Palette actions on supported devices.

**You stay in control.** Creating a note or editing a draft does not automatically publish a post or send an email. Publishing and sending require explicit actions.

## Install

1. Open **Obsidian → Settings → Community plugins**.
2. Select **Browse** and search for **HakiSend Publisher**.
3. Select **Install**, then **Enable**.
4. Open **Settings → HakiSend Publisher**, and connect your HakiSend account through your browser.

### Requirements

- Obsidian **1.11.4** or later.
- A HakiSend account with access to at least one HakiSend Site.
- Internet access when communicating with HakiSend.

The plugin itself is free. Some operations may require an eligible HakiSend service plan.

## Get started: publish a website post

1. Open the **Command Palette** in Obsidian and search for **HakiSend Publisher**.
2. Select **New website post**, choose a folder, and enter a title.
3. Write your content in the new Markdown note.
4. Use **Edit post details** (or **Edit post properties**, depending on the displayed command version) to review the category, tags, excerpt and URL settings.
5. Select **Save post** to save a draft to HakiSend.
6. When ready, choose **Publish post now** or **Schedule post**.

Saving a draft and publishing a website are separate actions.

## Get started: create an Email Only message

1. Open a regular Markdown note outside the **HakiSend Emails** folder.
2. Open the Command Palette and select **Email — create or continue**.
3. Choose the destination Site and follow the prompts to create an Email Only draft.
4. Write and review the email, choose the audience, and complete the send confirmation.
5. Choose **Send now** or **Schedule** when the email is ready.

If an existing HakiSend email draft is already open, the same command continues that email instead of creating a new one.

## View the content calendar

Open **Content calendar (Website + Email)** from the Command Palette. Choose a Site and channel, move between months, and select a date to see its activity.

The calendar is **read-only**. It shows server-confirmed events when supported by the connected HakiSend service; it does not send email or publish posts.

## Available commands

Open the Command Palette and search for **HakiSend Publisher**. The standard commands include:

- Connect account
- New website post
- Choose site for note
- Edit post details / properties
- Save post
- Publish post now
- Schedule post
- Create email from published post
- Email — create or continue
- Content calendar (Website + Email)

Some command labels may vary slightly with the installed version.

## Privacy and connection

Your source Markdown files remain in your Obsidian vault. When you explicitly save, publish, upload media, send or schedule through HakiSend, the plugin transfers the content and information required for that action to your connected HakiSend service over HTTPS.

Account connections use Obsidian Secret Storage. The plugin does not add client-side advertising or telemetry. See [Technical reference](docs/README_technical_reference_0.1.44.md) for network behavior, security details and development notes.

## Troubleshooting and support

- **Can't connect:** Open the plugin settings and reconnect your HakiSend account in the browser.
- **A Site is missing:** Check that your HakiSend account has access to that Site.
- **Can't send or publish:** Review the message shown by the plugin. It will not bypass permission or delivery checks.
- **A command is missing:** Use the Command Palette search and confirm that the plugin is enabled.

Report issues at [GitHub Issues](https://github.com/kienteaching-arch/hakisend-publisher/issues). Never include passwords, access tokens or the plugin's local `data.json` in support messages.

## License

Free and open-source under the [MIT License](LICENSE).
