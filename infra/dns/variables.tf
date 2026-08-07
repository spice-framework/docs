variable "zone_name" {
  description = "Cloudflare zone serving the documentation site."
  type        = string
  default     = "spiceframework.dev"

  validation {
    condition     = var.zone_name == "spiceframework.dev"
    error_message = "This state is intentionally scoped only to spiceframework.dev."
  }
}

variable "github_pages_verification" {
  description = "Optional GitHub organization Pages verification challenge. Retain the TXT record after verification."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.github_pages_verification == null ||
      can(regex("^[A-Za-z0-9_-]{16,255}$", var.github_pages_verification))
    )
    error_message = "The Pages verification challenge has an unexpected format."
  }
}
