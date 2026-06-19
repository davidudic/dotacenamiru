import type { MetricsRequest } from '#shared/types'
import { getAdapter } from '../adapters'
import { n8nFetchMetrics } from '../orchestration/n8n'
import { getEnv } from '../utils/env'
import { writeAudit } from '../utils/audit'

export default defineEventHandler(async (event) => {
  const body = await readBody<MetricsRequest>(event)
  const env = getEnv(event)
  const start = Date.now()

  if (!body?.platform || !body?.mode || !body?.contentId) {
    throw createError({ statusCode: 400, statusMessage: 'platform, mode and contentId are required' })
  }

  const adapter = getAdapter(body.platform)

  try {
    const fetched = body.mode === 'orchestrated'
      ? await n8nFetchMetrics(env, body.platform, body.contentId)
      : await adapter.fetchMetricsDirect(body.contentId, env)

    const normalized = adapter.normalize(fetched.raw, {
      contentId: body.contentId,
      mode: body.mode,
      publishedAt: fetched.publishedAt ?? body.publishedAt,
      contentUrl: fetched.contentUrl ?? body.contentUrl,
    })

    await writeAudit(env, {
      platform: body.platform,
      mode: body.mode,
      action: 'metrics',
      contentId: body.contentId,
      status: 'ok',
      latencyMs: Date.now() - start,
      summary: `Fetched ${body.platform} metrics for ${body.contentId}`,
    })
    return normalized
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Metrics fetch failed'
    await writeAudit(env, {
      platform: body.platform,
      mode: body.mode,
      action: 'metrics',
      contentId: body.contentId,
      status: 'error',
      latencyMs: Date.now() - start,
      summary: message,
    })
    throw createError({ statusCode: 502, statusMessage: message })
  }
})
