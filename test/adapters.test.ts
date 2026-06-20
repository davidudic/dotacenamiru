import { describe, expect, it } from 'vitest'
import { facebookAdapter } from '../server/adapters/facebook'
import { youtubeAdapter } from '../server/adapters/youtube'
import type { AppEnv } from '../server/utils/env'

describe('youtubeAdapter', () => {
  it('normalizes a videos.list response', () => {
    const raw = {
      items: [{
        statistics: { viewCount: '5', likeCount: '2', commentCount: '1' },
        snippet: { publishedAt: '2026-06-19T16:11:23Z' },
      }],
    }
    const m = youtubeAdapter.normalize(raw, { contentId: 'abc', mode: 'direct' })
    expect(m.metrics).toEqual({ views: 5, likes: 2, comments: 1 })
    expect(m.contentUrl).toBe('https://www.youtube.com/watch?v=abc')
    expect(m.mode).toBe('direct')
  })

  it('reports configured only with all three secrets', () => {
    expect(youtubeAdapter.isConfigured({} as AppEnv)).toBe(false)
    expect(youtubeAdapter.isConfigured({
      YOUTUBE_CLIENT_ID: 'a',
      YOUTUBE_CLIENT_SECRET: 'b',
      YOUTUBE_REFRESH_TOKEN: 'c',
    } as AppEnv)).toBe(true)
  })
})

describe('facebookAdapter', () => {
  it('normalizes a graph fields response and sums engagement', () => {
    const raw = {
      created_time: '2026-06-20T11:31:24+0000',
      reactions: { summary: { total_count: 4 } },
      comments: { summary: { total_count: 2 } },
      shares: { count: 1 },
    }
    const m = facebookAdapter.normalize(raw, { contentId: '10_20', mode: 'orchestrated' })
    expect(m.metrics).toEqual({ likes: 4, comments: 2, shares: 1, engagements: 7 })
    expect(m.mode).toBe('orchestrated')
  })

  it('reports configured only with page id + token', () => {
    expect(facebookAdapter.isConfigured({ FACEBOOK_PAGE_ID: '1' } as AppEnv)).toBe(false)
    expect(facebookAdapter.isConfigured({
      FACEBOOK_PAGE_ID: '1',
      FACEBOOK_PAGE_ACCESS_TOKEN: 't',
    } as AppEnv)).toBe(true)
  })
})
