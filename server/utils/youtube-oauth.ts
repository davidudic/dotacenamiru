import type { AppEnv } from './env'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CACHE_KEY = 'youtube:access_token'

interface TokenResponse {
  access_token: string
  expires_in: number
  scope?: string
  token_type?: string
}

/**
 * Returns a valid YouTube OAuth access token, exchanging the long-lived
 * refresh token when needed. The short-lived access token is cached in KV
 * (TTL just under its real expiry) so we don't hit Google on every request.
 *
 * The refresh token itself lives only as a Worker secret (env), never in KV/D1.
 */
export async function getYouTubeAccessToken(env: AppEnv): Promise<string> {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) {
    throw new Error(
      'YouTube is not configured: set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN.',
    )
  }

  // 1) Serve a cached access token if we have one.
  if (env.TOKEN_CACHE) {
    const cached = await env.TOKEN_CACHE.get(CACHE_KEY)
    if (cached) return cached
  }

  // 2) Exchange the refresh token for a fresh access token.
  const body = new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID,
    client_secret: env.YOUTUBE_CLIENT_SECRET,
    refresh_token: env.YOUTUBE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = (await res.json()) as TokenResponse & { error?: string, error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(
      `YouTube token refresh failed (${res.status}): ${json.error_description || json.error || 'unknown error'}`,
    )
  }

  // 3) Cache with a small safety margin.
  if (env.TOKEN_CACHE) {
    const ttl = Math.max(60, (json.expires_in || 3600) - 60)
    await env.TOKEN_CACHE.put(CACHE_KEY, json.access_token, { expirationTtl: ttl })
  }

  return json.access_token
}
