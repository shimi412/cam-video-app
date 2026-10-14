-- Assistant usage survives conversation deletion and also covers production planning.
ALTER TABLE assistant_requests ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE assistant_requests DROP CONSTRAINT IF EXISTS assistant_requests_conversation_id_fkey;
ALTER TABLE assistant_requests ADD CONSTRAINT assistant_requests_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE assistant_requests ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'chat';
ALTER TABLE api_calls ALTER COLUMN real_cost_usd TYPE numeric(14,8);
ALTER TABLE api_calls ALTER COLUMN billed_usd TYPE numeric(14,8);
