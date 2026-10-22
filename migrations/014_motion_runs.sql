CREATE TABLE IF NOT EXISTS motion_runs (
 job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
 actor_id text NOT NULL,
 state jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
