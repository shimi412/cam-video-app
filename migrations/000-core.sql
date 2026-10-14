-- Baseline for new installations. Existing development databases keep their data.
DO $$ BEGIN CREATE TYPE job_status AS ENUM ('draft','estimated','confirmed','running','succeeded','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_mode AS ENUM ('auto','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_kind AS ENUM ('topup','consumption','adjustment'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE call_kind AS ENUM ('chat','image','video','tts','render'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
  description text NOT NULL, status text NOT NULL DEFAULT 'active', recipe jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, mode conversation_mode NOT NULL DEFAULT 'auto',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL, content jsonb NOT NULL, created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id), template_id uuid REFERENCES templates(id),
  status job_status NOT NULL DEFAULT 'draft', script text NOT NULL, params jsonb NOT NULL DEFAULT '{}',
  estimate_usd numeric(10,2), billed_usd numeric(10,2), output_path text, error text,
  created_at timestamp NOT NULL DEFAULT now(), confirmed_at timestamp, finished_at timestamp
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE TABLE IF NOT EXISTS api_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES jobs(id), conversation_id uuid REFERENCES conversations(id),
  provider text NOT NULL, kind call_kind NOT NULL, model text NOT NULL, real_cost_usd numeric(10,4) NOT NULL,
  billed_usd numeric(10,4) NOT NULL, meta jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_calls_job_idx ON api_calls(job_id);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delta_usd numeric(10,2) NOT NULL, kind ledger_kind NOT NULL,
  job_id uuid REFERENCES jobs(id), note text, created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamp NOT NULL DEFAULT now()
);
