variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with Workers KV + D1 edit permissions. Provide via TF_VAR_cloudflare_api_token."
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the Worker / KV / D1 resources."
}

variable "name_prefix" {
  type        = string
  default     = "marketing-microsite"
  description = "Prefix applied to created resource names."
}
