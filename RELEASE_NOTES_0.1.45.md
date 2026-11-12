# HakiSend Publisher 0.1.45 — Full mobile calendar month

- Fix the native **Content calendar** on Android and other narrow-screen layouts: all six week rows (42 date cells) are visible instead of clipping after two or three weeks.
- Constrain mobile calendar date buttons and weekday headers to predictable touch-friendly heights so Obsidian theme styles cannot stretch or truncate the grid.
- Keep the modal itself scrollable, rather than cropping part of the month.
- Preserve website/email filters, event detail cards, read-only requests, and all publishing and sending behavior.

## Validation

The repository's build and automated tests run before GitHub Actions creates a release. A mobile regression test checks the complete six-week grid layout. Real-device verification is still required after updating through Obsidian Community.
