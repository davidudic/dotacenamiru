terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.11"
    }
  }
}

provider "cloudflare" {
  # Read from TF_VAR_cloudflare_api_token — never hard-code it here.
  api_token = var.cloudflare_api_token
}
