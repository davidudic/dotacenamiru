// Shared types used by both the Nuxt app (UI) and the Nitro server routes.
// Imported via the `#shared/types` alias.

export type Platform = 'youtube' | 'facebook'
export type ExecutionMode = 'direct' | 'orchestrated'
export type ContentAction = 'post' | 'metrics'

/** Input for publishing a piece of content. Fields are a superset across platforms. */
export interface PublishInput {
  platform: Platform
  title: string
  description?: string
  /** YouTube: base64-encoded (small) video file. */
  mediaBase64?: string
  /** MIME type of mediaBase64, e.g. "video/mp4". */
  mediaContentType?: string
  /** YouTube upload privacy. Unverified apps are forced to "private" by the API. */
  privacy?: 'private' | 'unlisted' | 'public'
  /** Facebook: publicly reachable image URL (photo post) or link to attach. */
  imageUrl?: string
  link?: string
}

/** Result of a publish action. */
export interface PublishResult {
  platform: Platform
  mode: ExecutionMode
  contentId: string
  contentUrl?: string
  /** ISO timestamp when the content was created. */
  publishedAt: string
  /** Raw provider/orchestrator response, for the raw-response viewer. */
  raw: unknown
}

/** Normalized metric values — the common denominator across platforms. */
export interface MetricValues {
  views?: number
  likes?: number
  comments?: number
  shares?: number
  impressions?: number
  engagements?: number
  clicks?: number
  saves?: number
}

/** A normalized internal metrics format, identical across Direct and Orchestrated modes. */
export interface NormalizedMetrics {
  platform: Platform
  mode: ExecutionMode
  contentId: string
  contentUrl?: string
  publishedAt?: string
  /** ISO timestamp when metrics were fetched. */
  fetchedAt: string
  metrics: MetricValues
  /** Raw provider/orchestrator response, for the raw-response viewer. */
  raw: unknown
}

/** One row in the audit log. */
export interface AuditEntry {
  id: number
  ts: string
  platform: Platform
  mode: ExecutionMode
  action: ContentAction
  contentId: string | null
  status: 'ok' | 'error'
  latencyMs: number
  summary: string
}

// ---- API request/response payloads ----

export interface PostRequest {
  platform: Platform
  mode: ExecutionMode
  title: string
  description?: string
  privacy?: 'private' | 'unlisted' | 'public'
  mediaBase64?: string
  mediaContentType?: string
  imageUrl?: string
  link?: string
}

export interface MetricsRequest {
  platform: Platform
  mode: ExecutionMode
  contentId: string
  publishedAt?: string
  contentUrl?: string
}

/** Which platforms/modes are usable, surfaced to the UI so it can disable controls. */
export interface ConfigStatus {
  platforms: Record<Platform, { directConfigured: boolean }>
  orchestrationConfigured: boolean
}
