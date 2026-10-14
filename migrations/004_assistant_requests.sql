CREATE TABLE IF NOT EXISTS assistant_requests (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','submitted','complete','uncertain')),
  maximum_usd numeric(10,6) NOT NULL CHECK (maximum_usd >= 0),
  actual_usd numeric(10,6),
  result jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_requests_month_idx ON assistant_requests(created_at);
