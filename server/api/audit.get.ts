import { getEnv } from '../utils/env'
import { readAudit } from '../utils/audit'

export default defineEventHandler(async (event) => {
  const env = getEnv(event)
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 200)
  const entries = await readAudit(env, limit)
  return { entries, enabled: Boolean(env.AUDIT_DB) }
})
