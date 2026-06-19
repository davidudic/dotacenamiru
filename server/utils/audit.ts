import type { AuditEntry, ContentAction, ExecutionMode, Platform } from '#shared/types'
import type { AppEnv } from './env'

export interface AuditInput {
  platform: Platform
  mode: ExecutionMode
  action: ContentAction
  contentId?: string | null
  status: 'ok' | 'error'
  latencyMs: number
  summary: string
}

/** Append a row to the D1 audit log. Never throws — auditing must not break the request. */
export async function writeAudit(env: AppEnv, entry: AuditInput): Promise<void> {
  if (!env.AUDIT_DB) return
  try {
    await env.AUDIT_DB
      .prepare(
        `INSERT INTO audit_log (ts, platform, mode, action, content_id, status, latency_ms, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        new Date().toISOString(),
        entry.platform,
        entry.mode,
        entry.action,
        entry.contentId ?? null,
        entry.status,
        entry.latencyMs,
        entry.summary.slice(0, 1000),
      )
      .run()
  } catch (err) {
    console.error('audit write failed:', err)
  }
}

/** Read the most recent audit rows (newest first). Tolerant of an unmigrated DB. */
export async function readAudit(env: AppEnv, limit = 50): Promise<AuditEntry[]> {
  if (!env.AUDIT_DB) return []
  try {
    const { results } = await env.AUDIT_DB
      .prepare(
        `SELECT id, ts, platform, mode, action, content_id AS contentId,
                status, latency_ms AS latencyMs, summary
         FROM audit_log ORDER BY id DESC LIMIT ?`,
      )
      .bind(limit)
      .all()
    return (results ?? []) as unknown as AuditEntry[]
  } catch (err) {
    // e.g. table not created yet — surface as empty rather than a 500.
    console.error('audit read failed:', err)
    return []
  }
}
