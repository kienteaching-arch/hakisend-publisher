# Markdown blockquote preflight (HakiSend Publisher)

This safeguard prevents a known mobile-layout problem in articles that were imported with nested Markdown quote prefixes such as `>>>` and `>>>>` around almost every paragraph and heading.

## What it does

- Runs when a website Post is **saved, published or scheduled** from Obsidian, before uploading local images or sending a Posts upsert request.
- Rejects long, suspicious multi-layer blockquotes: at least eight nested-quote lines, with two quoted headings, or with three or more quote layers covering at least 60% of the Markdown lines.
- Allows short intentional nested quotes, ordinary single-level `>` quotations, and literal syntax inside fenced code blocks.
- Shows an explanation in the Obsidian Notice; the user must fix the Markdown and retry.
- Does **not** automatically modify Markdown, images, links, content, schedules or metadata.

## Source correction

Prefer removing the article-wide outer quote markers from the Markdown source. Keep intentional quotes and fenced code. Preserve YAML frontmatter, stable external identifiers, slugs, content, links and media references. Do not attempt a general regex replacement on unrelated notes.

The original source must be corrected in Obsidian or in its synchronized Git repository: a one-time HakiSend production repair can be overwritten by a later Publisher save.

## Test

```bash
npm test
```

The regression tests in `tests/markdown_quote_preflight.test.cjs` also verify the publication guard runs before any media uploads or Posts upsert request.