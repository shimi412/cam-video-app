CREATE TABLE customer_quotes (
 id text PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id), supplier_quote text NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents>0), expires_at timestamptz NOT NULL,
 UNIQUE(job_id,supplier_quote)
);
CREATE TABLE credit_holds (
 job_id uuid PRIMARY KEY REFERENCES jobs(id), quote_id text NOT NULL REFERENCES customer_quotes(id),
 amount_cents integer NOT NULL CHECK(amount_cents>0), state text NOT NULL CHECK(state IN ('reserved','spent','released')),
 ledger_id uuid UNIQUE REFERENCES credit_ledger(id), updated_at timestamptz NOT NULL DEFAULT now()
);
