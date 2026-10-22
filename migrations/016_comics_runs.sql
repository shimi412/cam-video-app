CREATE TABLE IF NOT EXISTS comics_runs (
 job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
 actor_id text NOT NULL,
 state jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comics_pending ON comics_runs ((state->>'queued')) WHERE state->>'queued'='true';
CREATE INDEX IF NOT EXISTS cam_agent_history ON cam_agent_events(session_id, sequence DESC);
