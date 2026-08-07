# Spice documentation portal

This repository builds the unified, source-owned documentation site at
[spiceframework.dev](https://spiceframework.dev). Product repositories own their Markdown and
examples; this repository owns the reviewed source lock, public routes, assembly, navigation,
search, presentation, and deployment.

## Architecture

The portal never executes source-repository code. `sources/ecosystem.lock.json` pins all 24 source
repositories and their publishable digests. The repository-owned snapshot materializer checks out
those exact commits into `.generated/sources`; the assembler validates each `spice-docs.json`,
normalizes ordinary Markdown through an AST, and produces provenance-bearing Starlight content,
raw Markdown, and `llms*.txt` exports. Generated trees are ignored and reproducible.

The interactive Spice code view imports the exact parser and semantic palettes from the locked
`chrome/packages/spice-syntax` package. Copy, raw, no-JavaScript, and LLM output always preserve the
canonical valid-Go `// @...` source.

See [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and [docs/authoring.md](docs/authoring.md) for
source-repository enrollment.

## Local verification

Use Node.js 24, pnpm 11.16.0, and Go 1.26.5. After dependencies are installed and the exact snapshot
has been materialized:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` covers schema and lock validation, type checking, unit and integration tests,
deterministic assembly, the static build, filtered Pagefind search, browser smoke tests, Axe
accessibility, representative layouts, and bundle budgets.

To propose a new reviewed snapshot, run `pnpm lock:sources` with network access, inspect the exact
commit and route changes, then run the full verification gate. Normal assembly and verification use
only the materialized snapshot.

## Infrastructure

GitHub Actions deploys the static `dist` artifact to GitHub Pages. `infra/dns` owns only the
DNS-only Cloudflare records for `spiceframework.dev`, using isolated Azure Blob state and an API
token read at runtime from Azure Key Vault. The token is never a Terraform input and is never
written to state. See [docs/operations.md](docs/operations.md).
