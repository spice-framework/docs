terraform {
  required_version = ">= 1.11.2, < 1.12.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.22.0"
    }
  }

  backend "azurerm" {
    subscription_id      = "cc2eeadc-ef37-4549-92f1-585b0a936274"
    tenant_id            = "abfcbee8-658f-4ab3-97f5-9b357e0f8cda"
    resource_group_name  = "ol-shared-foundation"
    storage_account_name = "olsharedtfstate"
    container_name       = "workspaces"
    key                  = "spice-framework/docs-dns.tfstate"
    use_azuread_auth     = true
  }
}

provider "cloudflare" {}
