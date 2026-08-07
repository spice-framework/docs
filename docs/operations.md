# Documentation operations

## Deployment

`deploy.yml` materializes the exact ecosystem snapshot, runs `pnpm verify`, uploads `dist`, and
deploys through the protected `github-pages` environment. Only the deployment job receives Pages
and OIDC write permissions. Pull requests receive no secrets.

## DNS

`infra/dns` uses the isolated backend key `spice-framework/docs-dns.tfstate` in the existing
`ol-shared-foundation/olsharedtfstate/workspaces` backend. GitHub Actions authenticates to Azure
through the user-assigned `ol-shared-foundation-mi` workload identity, then reads
`spice-framework-cloudflare-api-key` from `ol-shared-kv` into a masked environment variable. The
Cloudflare provider consumes `CLOUDFLARE_API_TOKEN` directly.

The configuration creates DNS-only GitHub Pages apex A/AAAA records, `www` CNAME, and an optional
persistent organization-verification TXT record. Do not enable Cloudflare proxying, wildcard DNS,
or replace the backend key with another workload's state.

## Source updates

The scheduled sync workflow proposes one reviewed lock pull request. It does not deploy. Review
new commits, route changes, provenance, removed content, and screenshots before merging. A normal
deployment always consumes the committed lock.

## Recovery

The site has no database or dynamic service. Re-deploy any previously green docs commit to restore
the portal. DNS state is separate; recover or import exact existing record identifiers before any
replacement. Never delete unknown zone records during documentation recovery.
