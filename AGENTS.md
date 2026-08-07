# Spice documentation implementation contract

## Mission

Deliver one polished static documentation portal for the Spice ecosystem while
leaving product truth, examples, architecture, compatibility, security, and
release guidance canonically owned by each source repository.

## Public invariants

- Production content comes only from exact 40-character commits in
  `sources/ecosystem.lock.json`; moving branches never deploy directly.
- Source repositories contribute ordinary Markdown, declared assets, and
  declared snippets. They never contribute executable MDX, scripts, styles, or
  build hooks.
- Generated content is deterministic, ignored, and never edited as canonical
  source. Every imported page retains repository, commit, path, and edit links.
- Enhanced Spice code always stores, copies, prints, and exports canonical valid
  Go with physical `// @` comments. Prefix concealment is presentation only.
- The exact locked `chrome/packages/spice-syntax` parser and palettes are used;
  this repository must not implement an approximate second parser.
- The site is fully static, makes no runtime CDN/font/script request, and keeps
  Pages deployment privileges isolated to the final deploy job.
- Cloudflare authority is limited to DNS for `spiceframework.dev`; its API token
  is read from Azure Key Vault into process environment and never committed or
  stored in Terraform state.

## Delivery

- Work directly on local `main` in bounded, reviewable commits.
- Use Node.js 24 and the exact pnpm version/hash declared by `packageManager`.
- Run `pnpm run check` for the broad edit loop and `pnpm run verify` on the exact
  tree before every commit.
- Fetch immediately before pushing and stop if `origin/main` moved
  unexpectedly.
- Do not commit `.generated`, `dist`, Pagefind output, Playwright reports,
  Terraform state, secrets, or transient verification artifacts.
