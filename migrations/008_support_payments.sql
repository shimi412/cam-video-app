CREATE TABLE support_requests (
 id uuid PRIMARY KEY, actor_id text NOT NULL, thread_id uuid NOT NULL,
 input_hash text NOT NULL, question text NOT NULL, reply text,
 state text NOT NULL CHECK(state IN ('submitted','complete','uncertain')),
 maximum_usd numeric(14,8) NOT NULL CHECK(maximum_usd >= 0), actual_usd numeric(14,8),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_requests_thread ON support_requests(actor_id,thread_id,created_at);
CREATE TABLE support_budget (id integer PRIMARY KEY CHECK(id=1), blocked_until timestamptz);
INSERT INTO support_budget(id) VALUES(1);
CREATE TABLE credit_orders (
 id uuid PRIMARY KEY, actor_id text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1000 AND 100000),
 session_id text UNIQUE, status text NOT NULL DEFAULT 'pending', live boolean NOT NULL,
 receipt_url text, ledger_id uuid UNIQUE REFERENCES credit_ledger(id), created_at timestamptz NOT NULL DEFAULT now()
);
