-- Run history. One row per accepted webhook event, one row per step of that run.

CREATE TABLE runs (
  id           uuid        PRIMARY KEY,                 -- UUIDv7: time ordered, appends to the B-tree
  flow_id      text        NOT NULL,                    -- MongoDB flow _id (hex). No FK: it lives in another database
  status       text        NOT NULL CHECK (status IN ('running', 'success', 'filtered', 'failed')),
  payload      jsonb       NOT NULL,                    -- the incoming event
  error        text,                                    -- set when status = 'failed'
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  duration_ms  integer     CHECK (duration_ms >= 0),
  CHECK ((status = 'running') = (finished_at IS NULL))  -- a run is finished exactly when it has a finish time
);

CREATE TABLE run_steps (
  run_id       uuid        NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  position     smallint    NOT NULL CHECK (position BETWEEN 1 AND 5),
  type         text        NOT NULL CHECK (type IN ('filter', 'transform', 'http_request')),
  status       text        NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  input        jsonb,
  output       jsonb,
  error        text,
  duration_ms  integer     NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  PRIMARY KEY (run_id, position)                        -- also serves "steps of a run, in order" and the cascade
);

-- Run list (newest first, keyset pagination), stats, latest run per flow, delete by flow:
--   WHERE flow_id = $1 [AND (started_at, id) < ($2, $3)] ORDER BY started_at DESC, id DESC
CREATE INDEX runs_flow_started_idx ON runs (flow_id, started_at DESC, id DESC);

-- Run list filtered by status: two equality columns, then the same order.
CREATE INDEX runs_flow_status_started_idx ON runs (flow_id, status, started_at DESC, id DESC);
