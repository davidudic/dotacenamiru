import type { Platform, PublishInput, PublishResult } from '#shared/types'
import type { FetchedRaw } from '../adapters/types'
import type { AppEnv } from '../utils/env'

/**
 * Orchestrated execution path. The same workflow (publish / fetch metrics) is
 * run by an n8n workflow instead of in-app code. The microsite POSTs to a
 * Header-Auth-protected n8n webhook; n8n talks to the platform and responds.
 *
 * Contract — n8n "Respond to Webhook" returns JSON:
 *   post:    { ok, action:'post',    contentId, contentUrl, publishedAt, raw }
 *   metrics: { ok, action:'metrics', raw, publishedAt?, contentUrl? }
 * where `raw` is the platform's native response (same shape the direct
 * adapter's normalize() consumes), keeping one normalized format across modes.
 */

interface N8nEnvelope {
  ok?: boolean
  action?: string
  contentId?: string
  id?: string
  contentUrl?: string
  publishedAt?: string
  raw?: unknown
  error?: string
}

async function callN8n(env: AppEnv, payload: Record<string, unknown>): Promise<N8nEnvelope> {
  if (!env.N8N_WEBHOOK_URL) {
    throw new Error('Orchestration is not configured: set N8N_WEBHOOK_URL (and N8N_WEBHOOK_TOKEN).')
  }
  const res = await fetch(env.N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.N8N_WEBHOOK_TOKEN ? { 'x-n8n-auth': env.N8N_WEBHOOK_TOKEN } : {}),
    },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  // n8n often wraps a single item in an array.
  const env0 = (Array.isArray(json) ? json[0] : json) as N8nEnvelope
  if (!res.ok || env0?.ok === false) {
    throw new Error(`Orchestration call failed (${res.status}): ${env0?.error || text.slice(0, 300)}`)
  }
  return env0 ?? {}
}

export async function n8nPublish(
  env: AppEnv,
  platform: Platform,
  input: PublishInput,
): Promise<PublishResult> {
  const data = await callN8n(env, { action: 'post', ...input })
  const contentId = data.contentId || data.id
  if (!contentId) throw new Error('Orchestrated post did not return a contentId.')
  return {
    platform,
    mode: 'orchestrated',
    contentId,
    contentUrl: data.contentUrl,
    publishedAt: data.publishedAt ?? new Date().toISOString(),
    raw: data.raw ?? data,
  }
}

export async function n8nFetchMetrics(
  env: AppEnv,
  platform: Platform,
  contentId: string,
): Promise<FetchedRaw> {
  const data = await callN8n(env, { action: 'metrics', platform, contentId })
  return {
    raw: data.raw ?? data,
    publishedAt: data.publishedAt,
    contentUrl: data.contentUrl,
  }
}
