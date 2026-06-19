import type { PostRequest, PublishInput } from '#shared/types'
import { getAdapter } from '../adapters'
import { n8nPublish } from '../orchestration/n8n'
import { getEnv } from '../utils/env'
import { writeAudit } from '../utils/audit'

export default defineEventHandler(async (event) => {
  const body = await readBody<PostRequest>(event)
  const env = getEnv(event)
  const start = Date.now()

  if (!body?.platform || !body?.mode) {
    throw createError({ statusCode: 400, statusMessage: 'platform and mode are required' })
  }
  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }

  const input: PublishInput = {
    platform: body.platform,
    title: body.title,
    description: body.description,
    privacy: body.privacy,
    mediaBase64: body.mediaBase64,
    mediaContentType: body.mediaContentType,
    imageUrl: body.imageUrl,
    link: body.link,
  }

  try {
    const result = body.mode === 'orchestrated'
      ? await n8nPublish(env, body.platform, input)
      : await getAdapter(body.platform).publishDirect(input, env)

    await writeAudit(env, {
      platform: body.platform,
      mode: body.mode,
      action: 'post',
      contentId: result.contentId,
      status: 'ok',
      latencyMs: Date.now() - start,
      summary: `Published ${body.platform} content ${result.contentId}`,
    })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed'
    await writeAudit(env, {
      platform: body.platform,
      mode: body.mode,
      action: 'post',
      contentId: null,
      status: 'error',
      latencyMs: Date.now() - start,
      summary: message,
    })
    throw createError({ statusCode: 502, statusMessage: message })
  }
})
