locals {
  github_pages_ipv4 = toset([
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ])
  github_pages_ipv6 = toset([
    "2606:50c0:8000::153",
    "2606:50c0:8001::153",
    "2606:50c0:8002::153",
    "2606:50c0:8003::153",
  ])
  zone_id = one(data.cloudflare_zones.site.result).id
}

data "cloudflare_zones" "site" {
  name      = var.zone_name
  max_items = 2
}

check "unique_active_zone" {
  assert {
    condition = (
      length(data.cloudflare_zones.site.result) == 1 &&
      data.cloudflare_zones.site.result[0].status == "active"
    )
    error_message = "The Cloudflare token must resolve exactly one active spiceframework.dev zone."
  }
}

resource "cloudflare_dns_record" "apex_ipv4" {
  for_each = local.github_pages_ipv4

  zone_id = local.zone_id
  name    = var.zone_name
  type    = "A"
  content = each.value
  ttl     = 3600
  proxied = false
  comment = "GitHub Pages apex managed by spice-framework/docs Terraform"
}

resource "cloudflare_dns_record" "apex_ipv6" {
  for_each = local.github_pages_ipv6

  zone_id = local.zone_id
  name    = var.zone_name
  type    = "AAAA"
  content = each.value
  ttl     = 3600
  proxied = false
  comment = "GitHub Pages apex managed by spice-framework/docs Terraform"
}

resource "cloudflare_dns_record" "www" {
  zone_id = local.zone_id
  name    = "www.${var.zone_name}"
  type    = "CNAME"
  content = "spice-framework.github.io"
  ttl     = 3600
  proxied = false
  comment = "GitHub Pages www redirect managed by spice-framework/docs Terraform"
}

resource "cloudflare_dns_record" "github_pages_verification" {
  count = var.github_pages_verification == null ? 0 : 1

  zone_id = local.zone_id
  name    = "_github-pages-challenge-spice-framework.${var.zone_name}"
  type    = "TXT"
  content = var.github_pages_verification
  ttl     = 3600
  proxied = false
  comment = "Persistent GitHub Pages organization-domain verification"
}
