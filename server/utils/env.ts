import type { H3Event } from 'h3'
import type { KVNamespace, D1Database } from '@cloudflare/workers-types'

/**
 * Resolved runtime environment. On Cloudflare Workers, secrets and resource
 * bindings (KV/D1) arrive via `event.context.cloudflare.env` — NOT process.env.
 * During local `nuxt dev`, `nitro-cloudflare-dev` populates the same path from
 * wrangler.toml + .dev.vars, so this helper works identically in both places.
 */
export interface AppEnv {
  YOUTUBE_CLIENT_ID?: string
  YOUTUBE_CLIENT_SECRET?: string
  YOUTUBE_REFRESH_TOKEN?: string
  N8N_WEBHOOK_URL?: string
  N8N_WEBHOOK_TOKEN?: string
  FACEBOOK_PAGE_ID?: string
  FACEBOOK_PAGE_ACCESS_TOKEN?: string
  FACEBOOK_API_VERSION?: string
  /** KV namespace for short-lived OAuth access-token caching. */
  TOKEN_CACHE?: KVNamespace
  /** D1 database for the audit log. */
  AUDIT_DB?: D1Database
}

export function getEnv(event: H3Event): AppEnv {
  const cf = (event.context as { cloudflare?: { env?: Record<string, unknown> } })
    .cloudflare?.env ?? {}
  // Fallback to process.env for plain-Node runs (non-secret string values only).
  const penv: Record<string, string | undefined>
    = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

  const str = (k: keyof AppEnv) => (cf[k as string] as string | undefined) ?? penv[k as string]

  return {
    YOUTUBE_CLIENT_ID: str('YOUTUBE_CLIENT_ID'),
    YOUTUBE_CLIENT_SECRET: str('YOUTUBE_CLIENT_SECRET'),
    YOUTUBE_REFRESH_TOKEN: str('YOUTUBE_REFRESH_TOKEN'),
    N8N_WEBHOOK_URL: str('N8N_WEBHOOK_URL'),
    N8N_WEBHOOK_TOKEN: str('N8N_WEBHOOK_TOKEN'),
    FACEBOOK_PAGE_ID: str('FACEBOOK_PAGE_ID'),
    FACEBOOK_PAGE_ACCESS_TOKEN: str('FACEBOOK_PAGE_ACCESS_TOKEN'),
    FACEBOOK_API_VERSION: str('FACEBOOK_API_VERSION') ?? 'v25.0',
    TOKEN_CACHE: cf.TOKEN_CACHE as KVNamespace | undefined,
    AUDIT_DB: cf.AUDIT_DB as D1Database | undefined,
  }
}
