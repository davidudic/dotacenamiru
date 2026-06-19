import type { NormalizedMetrics, PublishInput, PublishResult } from '#shared/types'
import type { AppEnv } from '../utils/env'
import { getYouTubeAccessToken } from '../utils/youtube-oauth'
import type { FetchedRaw, NormalizeMeta, PlatformAdapter } from './types'

const RESUMABLE_UPLOAD_URL
  = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'

function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

/**
 * Decode a base64 string to bytes using only Workers-native APIs (no node:buffer).
 * Keep test videos small (≈≤2 MB) on the Workers free plan: this loop is the
 * only CPU-bound step and the free plan caps CPU at 10 ms/request.
 */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Direct YouTube Data API v3 path.
 *  - publish: 2-step resumable upload (videos.insert)
 *  - metrics: videos.list?part=statistics,snippet
 */
export const youtubeAdapter: PlatformAdapter = {
  id: 'youtube',

  isConfigured(env: AppEnv) {
    return Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REFRESH_TOKEN)
  },

  async publishDirect(input: PublishInput, env: AppEnv): Promise<PublishResult> {
    if (!input.mediaBase64) {
      throw new Error('YouTube publish requires a video file (mediaBase64).')
    }
    const accessToken = await getYouTubeAccessToken(env)
    const bytes = base64ToBytes(input.mediaBase64)
    const contentType = input.mediaContentType || 'video/*'

    // Step 1: open a resumable upload session.
    const initRes = await fetch(RESUMABLE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': contentType,
        'x-upload-content-length': String(bytes.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: input.title,
          description: input.description ?? '',
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: input.privacy ?? 'private',
          selfDeclaredMadeForKids: false,
        },
      }),
    })

    if (!initRes.ok) {
      throw new Error(`YouTube upload init failed (${initRes.status}): ${await initRes.text()}`)
    }
    const sessionUrl = initRes.headers.get('location')
    if (!sessionUrl) {
      throw new Error('YouTube upload init did not return a session URL.')
    }

    // Step 2: upload the bytes in a single PUT (fine for small test videos).
    const uploadRes = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType, 'content-length': String(bytes.byteLength) },
      body: new Blob([bytes], { type: contentType }),
    })

    const video = (await uploadRes.json()) as {
      id?: string
      snippet?: { publishedAt?: string }
      error?: { message?: string }
    }
    if (!uploadRes.ok || !video.id) {
      throw new Error(
        `YouTube upload failed (${uploadRes.status}): ${video.error?.message || 'unknown error'}`,
      )
    }

    return {
      platform: 'youtube',
      mode: 'direct',
      contentId: video.id,
      contentUrl: watchUrl(video.id),
      publishedAt: video.snippet?.publishedAt ?? new Date().toISOString(),
      raw: video,
    }
  },

  async fetchMetricsDirect(contentId: string, env: AppEnv): Promise<FetchedRaw> {
    const accessToken = await getYouTubeAccessToken(env)
    const url = `${VIDEOS_URL}?part=statistics,snippet&id=${encodeURIComponent(contentId)}`
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    const json = (await res.json()) as {
      items?: Array<{ snippet?: { publishedAt?: string } }>
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(`YouTube metrics fetch failed (${res.status}): ${json.error?.message || 'error'}`)
    }
    return {
      raw: json,
      publishedAt: json.items?.[0]?.snippet?.publishedAt,
      contentUrl: watchUrl(contentId),
    }
  },

  normalize(raw: unknown, meta: NormalizeMeta): NormalizedMetrics {
    // `raw` is a videos.list response (identical shape in both Direct and
    // Orchestrated mode — the n8n HTTP Request node hits the same endpoint).
    const r = raw as {
      items?: Array<{
        statistics?: { viewCount?: string, likeCount?: string, commentCount?: string }
        snippet?: { publishedAt?: string }
      }>
    }
    const stats = r.items?.[0]?.statistics ?? {}
    const num = (v?: string) => (v == null ? undefined : Number(v))
    return {
      platform: 'youtube',
      mode: meta.mode,
      contentId: meta.contentId,
      contentUrl: meta.contentUrl ?? watchUrl(meta.contentId),
      publishedAt: meta.publishedAt ?? r.items?.[0]?.snippet?.publishedAt,
      fetchedAt: new Date().toISOString(),
      metrics: {
        views: num(stats.viewCount),
        likes: num(stats.likeCount),
        comments: num(stats.commentCount),
      },
      raw,
    }
  },
}
