-- Historical local test credits are never sold as customer funds.
ALTER TABLE credit_ledger ADD COLUMN wallet text NOT NULL DEFAULT 'preview' CHECK(wallet IN ('preview','customer'));
CREATE INDEX credit_ledger_wallet ON credit_ledger(wallet,created_at);
