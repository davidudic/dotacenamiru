import type { Platform } from '#shared/types'
import type { PlatformAdapter } from './types'
import { youtubeAdapter } from './youtube'
import { facebookAdapter } from './facebook'

export const adapters: Record<Platform, PlatformAdapter> = {
  youtube: youtubeAdapter,
  facebook: facebookAdapter,
}

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform]
  if (!adapter) throw new Error(`Unknown platform: ${platform}`)
  return adapter
}
