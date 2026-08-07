# Documentation DNS

This directory is the only Terraform authority for the GitHub Pages records at
`spiceframework.dev`. Its Azure Blob backend uses the dedicated key
`spice-framework/docs-dns.tfstate`; it never shares the Kubernetes state key.

The Cloudflare provider reads `CLOUDFLARE_API_TOKEN` from the process
environment. Local operators retrieve it without printing it:

```powershell
$env:CLOUDFLARE_API_TOKEN = az keyvault secret show `
  --subscription ol-azure-platform-foundation `
  --vault-name ol-shared-kv `
  --name spice-framework-cloudflare-api-key `
  --query value -o tsv
terraform -chdir=infra/dns init
terraform -chdir=infra/dns plan
```

The token is never a Terraform variable, output, committed value, or state
attribute. The configuration manages only DNS records in the already existing
zone and intentionally keeps GitHub Pages records DNS-only (`proxied = false`).

GitHub organization domain verification is a one-time owner bootstrap. Add
`spiceframework.dev` under the `spice-framework` organization Pages settings,
then pass the displayed challenge temporarily as
`-var github_pages_verification=...`. Keep the resulting TXT record in state
after GitHub reports the domain verified. Wildcard records are not used.
