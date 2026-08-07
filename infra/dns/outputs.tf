output "zone_id" {
  description = "Cloudflare zone identifier used for the records."
  value       = local.zone_id
}

output "apex_ipv4" {
  description = "DNS-only GitHub Pages IPv4 records."
  value       = sort([for record in cloudflare_dns_record.apex_ipv4 : record.content])
}

output "apex_ipv6" {
  description = "DNS-only GitHub Pages IPv6 records."
  value       = sort([for record in cloudflare_dns_record.apex_ipv6 : record.content])
}

output "www_target" {
  description = "DNS-only www target."
  value       = cloudflare_dns_record.www.content
}
