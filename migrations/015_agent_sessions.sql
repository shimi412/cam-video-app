CREATE TABLE IF NOT EXISTS cam_agent_sessions (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cam_agent_turns (
  session_id text NOT NULL REFERENCES cam_agent_sessions(id),
  id text NOT NULL,
  input_hash text NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,id)
);
CREATE TABLE IF NOT EXISTS cam_agent_events (
  sequence bigserial PRIMARY KEY,
  session_id text NOT NULL REFERENCES cam_agent_sessions(id),
  event_key text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('request','decision','execution')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,event_key)
);
CREATE TABLE IF NOT EXISTS cam_agent_memories (
  id uuid PRIMARY KEY,
  content text NOT NULL,
  reason text NOT NULL,
  source_session text NOT NULL REFERENCES cam_agent_sessions(id),
  source_turn text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','retired')),
  version integer NOT NULL DEFAULT 1,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(source_session,source_turn,content)
);
