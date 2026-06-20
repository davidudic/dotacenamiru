#!/usr/bin/env bash
# One-command reproducible deploy: OpenTofu provisions KV + D1, their ids are
# wired into wrangler.toml, the D1 schema is applied, secrets are pushed from
# .dev.vars, then the Worker is built and deployed.
#
# Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment;
# tofu (or terraform), node/npm on PATH; secrets in .dev.vars (KEY=VALUE).

set -euo pipefail
cd "$(dirname "$0")/.."

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
export TF_VAR_cloudflare_api_token="$CLOUDFLARE_API_TOKEN"
export TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID"

TOFU=$(command -v tofu || command -v terraform)

echo "▸ provisioning KV + D1 (OpenTofu)"
"$TOFU" -chdir=infra init -input=false >/dev/null
"$TOFU" -chdir=infra apply -auto-approve -input=false >/dev/null

KV=$("$TOFU" -chdir=infra output -raw kv_namespace_id)
D1=$("$TOFU" -chdir=infra output -raw d1_database_id)
echo "  KV=$KV  D1=$D1"

echo "▸ wiring ids into wrangler.toml"
sed -i.bak -E "s|^id = \".*\"|id = \"$KV\"|; s|^database_id = \".*\"|database_id = \"$D1\"|" wrangler.toml
rm -f wrangler.toml.bak

echo "▸ applying D1 schema"
echo y | npx wrangler d1 execute AUDIT_DB --remote --file=infra/schema.sql >/dev/null

echo "▸ pushing secrets from .dev.vars"
if [ -f .dev.vars ]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^[A-Z0-9_]+$ ]] || continue
    [ -n "$val" ] || continue
    printf '%s' "$val" | npx wrangler secret put "$key" >/dev/null
    echo "  set $key"
  done < .dev.vars
fi

echo "▸ building + deploying"
npm run build >/dev/null
npx wrangler deploy

echo "✓ deployed"
