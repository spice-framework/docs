# Source documentation authoring

Each enrolled repository has a root `spice-docs.json` validated by
`schemas/spice-docs.schema.json`. The manifest declares product identity, family, maturity, audience,
ordinary Markdown selections, stable route intent, search visibility, allowed local assets, and
allowed Go snippet roots.

Use narrow source globs and explicit exclusions. A fixed `route` may select one file; `routeFrom`
removes a reviewed source prefix before deterministic slugging. Nested `README.md` and `index.md`
map to their directory route. Aliases are validated centrally and must not collide with canonical
routes.

Use canonical Markdown links. Relative links to another published source page are rewritten to its
public route; source files outside the publication set remain exact locked GitHub links. Remote
images are linked, never fetched. Local assets are fingerprinted, and untrusted SVG is rejected.

Source-backed examples use a declared Go file and named region. The assembler extracts the exact
bytes and rejects missing, nested, duplicate, or unbalanced regions. It also rejects naked
annotation pseudo-syntax; documentation examples must remain valid Go comments such as
`// @Controller`.

Run the source repository's normal product gate and its `.github/workflows/docs.yml`. The docs
workflow is an additional portal integration check, not a replacement for compilation or product
verification.
