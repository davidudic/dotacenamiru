import type {
  ExecutionMode,
  NormalizedMetrics,
  Platform,
  PublishInput,
  PublishResult,
} from '#shared/types'
import type { AppEnv } from '../utils/env'

export interface FetchedRaw {
  raw: unknown
  publishedAt?: string
  contentUrl?: string
}

export interface NormalizeMeta {
  contentId: string
  mode: ExecutionMode
  publishedAt?: string
  contentUrl?: string
}

/**
 * A platform adapter encapsulates everything platform-specific for the DIRECT
 * execution path, plus the response->NormalizedMetrics mapping that is reused by
 * BOTH modes (so orchestrated and direct produce an identical internal shape).
 */
export interface PlatformAdapter {
  id: Platform
  /** Whether the secrets needed for the direct path are present. */
  isConfigured: (env: AppEnv) => boolean
  /** Publish content directly via the platform API. */
  publishDirect: (input: PublishInput, env: AppEnv) => Promise<PublishResult>
  /** Fetch raw metrics for a piece of content directly via the platform API. */
  fetchMetricsDirect: (contentId: string, env: AppEnv) => Promise<FetchedRaw>
  /** Map a raw provider/orchestrator response into the normalized format. */
  normalize: (raw: unknown, meta: NormalizeMeta) => NormalizedMetrics
}
