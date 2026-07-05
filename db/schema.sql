CREATE TABLE IF NOT EXISTS uploaded_blob (
  id         UUID        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  thread_id  TEXT        NOT NULL,
  filename   TEXT        NOT NULL,
  mime_type  TEXT        NOT NULL,
  byte_size  BIGINT      NOT NULL,
  sha256     TEXT        NOT NULL,
  content    BYTEA       NOT NULL,
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uploaded_blob_user_created_idx
ON uploaded_blob (user_id, created_at DESC);

ALTER TABLE uploaded_blob
ADD COLUMN IF NOT EXISTS thread_id TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE uploaded_blob
ALTER COLUMN thread_id DROP DEFAULT;

CREATE INDEX IF NOT EXISTS uploaded_blob_user_thread_created_idx
ON uploaded_blob (user_id, thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS performance_metric (
  id                    UUID        PRIMARY KEY,
  user_id               TEXT        NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  thread_id             TEXT        NOT NULL,
  prompt_chars          INTEGER     NOT NULL,
  response_chars        INTEGER,
  total_duration_ms     INTEGER     NOT NULL,
  model_duration_ms     INTEGER,
  tool_duration_ms      INTEGER,
  tool_invocation_count INTEGER     NOT NULL DEFAULT 0,
  cpu_user_micros       BIGINT,
  cpu_system_micros     BIGINT,
  rss_bytes             BIGINT,
  heap_used_bytes       BIGINT,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performance_metric_user_created_idx
ON performance_metric (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS performance_metric_thread_created_idx
ON performance_metric (thread_id, created_at);
