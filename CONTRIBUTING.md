# Contributing documentation

Technical documentation belongs beside the product that implements it. Change the owning source
repository's ordinary Markdown, examples, and `spice-docs.json`; its pinned documentation workflow
will validate the proposed source overlay against the complete portal.

Change this repository only for portal-wide behavior such as contracts, routes, navigation,
assembly, search, accessibility, design, source locking, exports, or deployment.

## Required checks

1. Keep source content ordinary Markdown. Source repositories may not publish executable MDX.
2. Declare all published content, asset roots, and source-backed snippet roots in `spice-docs.json`.
3. Preserve canonical valid-Go `// @...` declarations in code blocks and source regions.
4. Do not add remote scripts, fonts, styles, images, or wildcard source paths.
5. Run `pnpm check` during the edit loop and `pnpm verify` on the exact tree to be committed.
6. For lock updates, review exact repository commits, publishable digests, route changes, and the
   deterministic build before merging.

Generated content under `.generated`, `dist`, Pagefind output, screenshots, and browser evidence is
not committed. Do not hand-edit the ecosystem lock or assembled content.
