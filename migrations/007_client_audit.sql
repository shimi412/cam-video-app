ALTER TABLE jobs ADD COLUMN title text CHECK (length(title) <= 80);
