# Paste these IDs into ../wrangler.toml (kv_namespaces.id and d1_databases.database_id).

output "kv_namespace_id" {
  value       = cloudflare_workers_kv_namespace.token_cache.id
  description = "TOKEN_CACHE KV namespace id -> wrangler.toml [[kv_namespaces]].id"
}

output "d1_database_id" {
  value       = cloudflare_d1_database.audit.id
  description = "AUDIT_DB D1 database id -> wrangler.toml [[d1_databases]].database_id"
}

output "d1_database_name" {
  value       = cloudflare_d1_database.audit.name
  description = "AUDIT_DB D1 database name -> wrangler.toml [[d1_databases]].database_name"
}
