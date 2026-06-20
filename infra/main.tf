# Infrastructure as code for the Marketing Microsite.
#
# Scope (the validated split): Terraform provisions the durable resources —
# the KV namespace (OAuth token cache) and the D1 database (audit log). The
# Worker script itself is deployed with `wrangler deploy` (Nitro's cloudflare_module
# output is a multi-chunk bundle that wrangler understands natively), and secrets
# are set out-of-band with `wrangler secret put` so they never enter Terraform state.
#
#   export TF_VAR_cloudflare_api_token=...     # never committed
#   terraform -chdir=infra apply
#   # then copy the outputs into ../wrangler.toml, and:
#   #   npm run db:remote        (apply schema to D1)
#   #   wrangler secret put YOUTUBE_CLIENT_ID  (etc.)
#   #   npm run deploy

resource "cloudflare_workers_kv_namespace" "token_cache" {
  account_id = var.cloudflare_account_id
  title      = "${var.name_prefix}-token-cache"
}

resource "cloudflare_d1_database" "audit" {
  account_id       = var.cloudflare_account_id
  name             = "${var.name_prefix}-audit"
  read_replication = { mode = "auto" }
}
