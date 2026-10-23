CREATE TABLE IF NOT EXISTS studio_missions (
 id uuid PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 category text NOT NULL,
 version integer NOT NULL,
 title text NOT NULL,
 script text NOT NULL,
 feedback jsonb NOT NULL DEFAULT '[]'::jsonb,
 price_cents integer NOT NULL,
 state text NOT NULL DEFAULT 'queued',
 media_path text,
 media_sha256 text,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 UNIQUE(job_id, version)
);
CREATE INDEX IF NOT EXISTS studio_missions_open ON studio_missions(state, created_at) WHERE state <> 'delivered';
