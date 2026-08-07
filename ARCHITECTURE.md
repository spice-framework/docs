# Documentation platform architecture

## Public invariants

- Every imported page has one source repository, exact commit, source path, locked-source URL, and
  source-aware edit URL.
- The `development` compatibility catalog is the active-repository authority; the central source
  map may curate routes but may not create a competing inventory.
- Builds consume exact commits and verified digests. Moving branches are used only to propose a new
  lock.
- Source repositories contribute ordinary Markdown and declared assets/snippets, never executable
  components or build commands.
- Route, asset, symlink, and snippet traversal fails closed. Collisions and manual/generated
  ownership conflicts fail the build.
- Assembly output is byte deterministic and contains no timestamps or absolute paths.
- Canonical valid-Go source is the only copyable/exported code. The visual Spice layer uses the
  exact locked shared parser.

## Pipeline

1. `scripts/lock-sources.ts` reconciles the compatibility catalog, source map, manifests, commits,
   and publishable SHA-256 digests into `sources/ecosystem.lock.json`.
2. `spice-dev snapshot materialize` creates the exact `.generated/sources` snapshot without running
   repository commands.
3. `packages/source-assembler` validates and transforms Markdown, links, assets, source regions,
   provenance, routes, raw exports, and LLM indexes into `.generated/site-build`.
4. Astro and Starlight build a static site. Pagefind indexes page metadata for product, family,
   kind, maturity, repository, channel, version, and default visibility.
5. GitHub Pages publishes only the verified `dist` artifact.

Source pull requests are overlaid in a temporary source root and lock by `preview:source`; they do
not mutate the reviewed central lock or execute source commands.

## Ownership

The central repository owns portal pages, mapping, navigation, aliases, presentation, contracts,
and deployment. Each product owns its overview, setup, architecture, compatibility, security,
support, examples, and release documentation. A content fix is therefore made in the source
repository surfaced in the page provenance, not in generated portal output.
