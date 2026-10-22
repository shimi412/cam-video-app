# Higgsfield integration boundary

Reviewed 2026-10-15 against the user-provided Higgsfield app prompt and the official index https://docs.higgsfield.ai/docs/llms.txt.

CAM is an existing app with Bina-owned credentials, authenticated users, saved jobs, budgets and local media retention. Re-scaffolding the Studio template or asking every client for a provider key would conflict with that product. The current connected transport is OAuth MCP, which now handles voice and qualified video candidates. It is not the separate REST account.

The official REST design is useful for a future migration:

- Server-only `HF_API_KEY`, the complete copied credential. Header `Authorization: Key <credential>` to `https://api.higgsfield.ai`. One password field if an administrator connection form is added, with “Connect API key”. Never browser storage, logs, or client bundles. Older documentation splits ID/secret; do not require users to do so.
- `POST /estimate/<verified-model-path>` with exact inputs returns credits and USD. Use the account estimate, not a guessed subscription conversion. Documentation examples are illustrative, not prices.
- Save `request_id` under the authenticated workspace/job before polling. Single paid POST; unknown outcomes require reconciliation. Poll from 2 to 10 seconds with backoff. Cancellation is a real provider POST, only before processing; closing a browser or rejecting a local review does not cancel an active request.
- Signed upload: request URL and headers server-side, PUT with those storage headers only, publish the returned media URL only after success. No separate storage credential and no API key forwarded to object storage.
- Keep catalog entries visible with verification state. A missing public schema does not establish unavailability. Model-specific paths must come from the provider catalog; no mapping from an MCP name by guesswork.
- Download outputs to durable storage; the documented retention is at least seven days. Failed/NSFW and eligible canceled requests have documented refund behavior, but CAM must wait for actual account evidence before releasing uncertain spend.

No REST key was requested, stored, tested or used during this implementation. No REST model mapping/access is marked verified. The full REST migration, webhook verification and provider cancellation are not shipped merely by documenting them. Current MCP integration remains explicit in operation records.

Sources: https://docs.higgsfield.ai/docs/authentication.md ; https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md ; https://docs.higgsfield.ai/docs/concepts/polling.md ; https://docs.higgsfield.ai/docs/api-reference/requests/cancel-a-queued-request.md .
