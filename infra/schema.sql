-- D1 schema for the audit log (nice-to-have).
-- Apply locally:  npm run db:local
-- Apply to prod:  npm run db:remote   (after `terraform apply` + filling wrangler.toml IDs)

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT    NOT NULL,
  platform   TEXT    NOT NULL,
  mode       TEXT    NOT NULL,
  action     TEXT    NOT NULL,
  content_id TEXT,
  status     TEXT    NOT NULL,
  latency_ms INTEGER NOT NULL,
  summary    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_id ON audit_log (id DESC);
