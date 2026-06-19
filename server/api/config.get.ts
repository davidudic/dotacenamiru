import type { ConfigStatus } from '#shared/types'
import { facebookAdapter } from '../adapters/facebook'
import { youtubeAdapter } from '../adapters/youtube'
import { getEnv } from '../utils/env'

/** Tells the UI which platforms/modes are usable so it can disable controls. */
export default defineEventHandler((event): ConfigStatus => {
  const env = getEnv(event)
  return {
    platforms: {
      youtube: { directConfigured: youtubeAdapter.isConfigured(env) },
      facebook: { directConfigured: facebookAdapter.isConfigured(env) },
    },
    orchestrationConfigured: Boolean(env.N8N_WEBHOOK_URL),
  }
})
