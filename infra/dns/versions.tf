terraform {
  required_version = ">= 1.11.2, < 1.12.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.22.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "ol-shared-foundation"
    storage_account_name = "olsharedtfstate"
    container_name       = "workspaces"
    key                  = "spice-framework/docs-dns.tfstate"
    use_azuread_auth     = true
  }
}

provider "cloudflare" {}
