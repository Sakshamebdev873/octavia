-- Optional X-Event-Id header: the sender's id for an event. Delivering the same
-- event twice to the same flow must not run the steps twice.
ALTER TABLE runs ADD COLUMN event_id text;

-- Claims an event: INSERT ... ON CONFLICT (flow_id, event_id) WHERE event_id IS NOT NULL DO NOTHING.
-- Partial, so runs without an event id cost nothing in this index.
CREATE UNIQUE INDEX runs_flow_event_uniq ON runs (flow_id, event_id) WHERE event_id IS NOT NULL;
