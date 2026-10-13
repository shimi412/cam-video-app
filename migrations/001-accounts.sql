CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, name text NOT NULL,
  password_hash text NOT NULL, role text NOT NULL DEFAULT 'client' CHECK (role IN ('client','admin')),
  disabled boolean NOT NULL DEFAULT false, session_version integer NOT NULL DEFAULT 1, created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, role text NOT NULL CHECK (role IN ('client','admin')),
  token_hash text UNIQUE NOT NULL, expires_at timestamp NOT NULL, consumed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(), created_by uuid REFERENCES app_users(id)
);
CREATE TABLE IF NOT EXISTS auth_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamp NOT NULL);
