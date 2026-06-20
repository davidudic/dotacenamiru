import type { Platform } from '../types'

/** Extract a content ID from a raw ID or a full watch/share URL. */
export function parseContentId(raw: string, platform: Platform): string {
  const s = raw.trim()
  if (!s) return s
  if (platform === 'youtube') {
    return s.match(/youtu\.be\/([\w-]{6,})/)?.[1]
      ?? s.match(/[?&]v=([\w-]{6,})/)?.[1]
      ?? s.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1]
      ?? s
  }
  return s.match(/\/posts\/(\w+)/)?.[1]
    ?? s.match(/story_fbid=(\d+)/)?.[1]
    ?? s
}
