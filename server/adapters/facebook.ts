import type { NormalizedMetrics, PublishInput, PublishResult } from '#shared/types'
import type { AppEnv } from '../utils/env'
import type { FetchedRaw, NormalizeMeta, PlatformAdapter } from './types'

function graphBase(env: AppEnv): string {
  return `https://graph.facebook.com/${env.FACEBOOK_API_VERSION || 'v25.0'}`
}

function postUrl(id: string): string {
  return `https://www.facebook.com/${id}`
}

/**
 * Direct Facebook Pages (Graph API) path. Secondary, ready-to-enable adapter:
 * works as soon as FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN are present.
 *
 * Metrics intentionally use the post's engagement *edge summaries*
 * (reactions/comments/shares) rather than the /insights endpoint, because the
 * June-2026 Page Insights deprecation removed many legacy post metrics. Edge
 * summary counts are stable and work on a brand-new page/post.
 */
export const facebookAdapter: PlatformAdapter = {
  id: 'facebook',

  isConfigured(env: AppEnv) {
    return Boolean(env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_ACCESS_TOKEN)
  },

  async publishDirect(input: PublishInput, env: AppEnv): Promise<PublishResult> {
    if (!env.FACEBOOK_PAGE_ID || !env.FACEBOOK_PAGE_ACCESS_TOKEN) {
      throw new Error('Facebook is not configured: set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.')
    }
    const base = graphBase(env)
    const message = [input.title, input.description].filter(Boolean).join('\n\n')

    let endpoint: string
    const params = new URLSearchParams({ access_token: env.FACEBOOK_PAGE_ACCESS_TOKEN })
    if (input.imageUrl) {
      endpoint = `${base}/${env.FACEBOOK_PAGE_ID}/photos`
      params.set('url', input.imageUrl)
      params.set('caption', message)
    } else {
      endpoint = `${base}/${env.FACEBOOK_PAGE_ID}/feed`
      params.set('message', message)
      if (input.link) params.set('link', input.link)
    }

    const res = await fetch(endpoint, { method: 'POST', body: params })
    const json = (await res.json()) as {
      id?: string
      post_id?: string
      error?: { message?: string }
    }
    const contentId = json.post_id || json.id
    if (!res.ok || !contentId) {
      throw new Error(`Facebook publish failed (${res.status}): ${json.error?.message || 'unknown error'}`)
    }

    return {
      platform: 'facebook',
      mode: 'direct',
      contentId,
      contentUrl: postUrl(contentId),
      publishedAt: new Date().toISOString(),
      raw: json,
    }
  },

  async fetchMetricsDirect(contentId: string, env: AppEnv): Promise<FetchedRaw> {
    if (!env.FACEBOOK_PAGE_ACCESS_TOKEN) {
      throw new Error('Facebook is not configured: set FACEBOOK_PAGE_ACCESS_TOKEN.')
    }
    const base = graphBase(env)
    const fields = [
      'created_time',
      'shares',
      'reactions.summary(true).limit(0)',
      'comments.summary(true).limit(0)',
      'likes.summary(true).limit(0)',
    ].join(',')
    const url = `${base}/${encodeURIComponent(contentId)}?fields=${encodeURIComponent(fields)}`
      + `&access_token=${encodeURIComponent(env.FACEBOOK_PAGE_ACCESS_TOKEN)}`

    const res = await fetch(url)
    const json = (await res.json()) as { created_time?: string, error?: { message?: string } }
    if (!res.ok) {
      throw new Error(`Facebook metrics fetch failed (${res.status}): ${json.error?.message || 'error'}`)
    }
    return { raw: json, publishedAt: json.created_time, contentUrl: postUrl(contentId) }
  },

  normalize(raw: unknown, meta: NormalizeMeta): NormalizedMetrics {
    const r = raw as {
      created_time?: string
      shares?: { count?: number }
      reactions?: { summary?: { total_count?: number } }
      comments?: { summary?: { total_count?: number } }
      likes?: { summary?: { total_count?: number } }
    }
    const reactions = r.reactions?.summary?.total_count ?? r.likes?.summary?.total_count
    const comments = r.comments?.summary?.total_count
    const shares = r.shares?.count
    const engagements = (reactions ?? 0) + (comments ?? 0) + (shares ?? 0)

    return {
      platform: 'facebook',
      mode: meta.mode,
      contentId: meta.contentId,
      contentUrl: meta.contentUrl ?? postUrl(meta.contentId),
      publishedAt: meta.publishedAt ?? r.created_time,
      fetchedAt: new Date().toISOString(),
      metrics: {
        likes: reactions,
        comments,
        shares,
        engagements,
      },
      raw,
    }
  },
}
