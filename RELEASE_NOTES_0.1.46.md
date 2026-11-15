# HakiSend Publisher 0.1.46 — Markdown quote nesting preflight

- Detect article-wide nested Markdown blockquotes before saving, publishing or scheduling a website Post.
- Prevent mobile layouts from collapsing into one-word lines when imported notes carry repeated `>>>` or `>>>>` markers around whole sections.
- Keep deliberate short quotations, normal single-level blockquotes and fenced code unchanged.
- Show an actionable error in Obsidian when risky formatting is detected; **do not automatically rewrite** the user's article.
- Run this check before media upload and the HakiSend `/posts/upsert` request, so no partial remote content is written for a rejected Post.
- Preserve Email Only, calendar, schedule rules, SEO metadata and all existing publishing behavior.

## Validation

- `npm run verify-build` ensures `src/runtime/publisher-bundle.cjs` and `main.js` are identical.
- `npm test` includes new quote-prefix regressions plus the existing Publisher tests.
- Community release is built by the existing GitHub workflow after changes are merged and checks pass.
- After Obsidian Community update, manually verify `Save post`, `Publish post now` and `Schedule post` with both clean and malformed notes.

This release changes the **Obsidian Publisher** workflow. It does not edit already-published HakiSend Site content or the separate KIÊNOS source repository.