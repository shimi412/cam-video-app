CREATE TABLE conversation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  label text NOT NULL, kind text NOT NULL CHECK (kind IN ('image','pdf','link')), file text, sha256 text, size integer, url text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX attachments_conversation_idx ON conversation_attachments(conversation_id);
CREATE TABLE campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, topic text NOT NULL, audience text NOT NULL, objective text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE campaign_briefs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 3), title text NOT NULL, angle text NOT NULL, script text NOT NULL DEFAULT '',
  conversation_id uuid REFERENCES conversations(id), updated_at timestamp NOT NULL DEFAULT now(), UNIQUE(campaign_id, position));
