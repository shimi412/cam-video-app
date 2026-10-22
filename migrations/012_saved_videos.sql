-- Only explicit user saves appear in My videos, including for existing jobs.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS saved_to_library boolean NOT NULL DEFAULT false;
