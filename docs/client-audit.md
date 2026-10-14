# Client audit implementation · 2026-10-14

## Delivered locally

- CAM logo and a light blue/navy interface; one Create video entry, My videos, Library, My credits and Help. Admin remains role-restricted.
- Creation includes an inline script assistant, saved project discussions, references and versions. Campaigns and Conversations removed from main navigation; existing records/routes preserved.
- Video cards use cached local film thumbnails, short editable persistent titles, status/date and download links. Existing demo renamed “Context matters”.
- Voice provider names removed from client copy and library descriptions. Internal provider bindings remain unchanged.
- Original character references expand on hover/focus and in a keyboard-accessible modal. These are the existing single-view references, not fabricated multi-angle turnarounds.
- Help uses the configured inexpensive DeepSeek model through Bina's server-side OpenRouter credentials. Only support/AGENTS.md and support/MEMORY.md are loaded as product context. No private personal memories, keys, customer documents or action tools are supplied.
- Help costs are recorded separately. All users share a rolling 24-hour $5 email recommendation and $10 ceiling; reservations count, uncertain requests remain held, and reaching the ceiling pauses help for 24 hours. A request that cannot fit its worst-case reservation is stopped before inference. Replays never automatically generate twice.
- My credits shows customer balance, reservations per video, spending and recharge history. Stripe checkout, signed webhooks, duplicate-event protection and receipt links implemented. Returning from checkout alone does not credit the wallet. Test payments do not grant real credits.
- Historical development credits explicitly remain in the preview wallet. They are not customer money. No historical supplier expense is automatically charged to CAM.
- Customer quotes freeze explicit Bina pricing, reserve credits atomically at approval, debit once on successful completion and release on rejection. Interrupted work retains its reservation for recovery. Admin operator productions without a customer quote keep their existing supplier-budget workflow.

## Commercial activation remains pending

No Stripe secret, webhook secret or public checkout origin is configured. The recharge button therefore remains disabled. Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and CAM_PUBLIC_URL to the server environment, then register /api/stripe/webhook for checkout.session.completed and checkout.session.async_payment_succeeded. Local verification requires Stripe CLI forwarding; deployment requires a public HTTPS endpoint. No actual payment or hosted deployment was tested.

No customer pricing was activated. Admin → Pricing & payments has the configuration form for the next economic discussion. It requires an explicit selling-price multiplier and actual USD purchase cost per Higgsfield credit. Quote formula: (fal dollar ceiling + narration credits × actual unit cost) × multiplier, rounded upward to a cent. Assistant and support costs remain Bina expenses; margin adequacy is not yet established. Existing quotes remain frozen if future settings change.

Customer production approval is blocked while pricing is missing. The administrator can still use the already-authorized operator workflow. No current storyboard was approved, no video animation or paid chatbot message was sent in this implementation.

## Validation

- TypeScript, ESLint, existing 165 unit tests and production build pass. Build retains pre-existing broad runtime-storage tracing warnings.
- test:client-audit uses a disposable Postgres schema and stubbed inference: shared/concurrent help budget, 24-hour reopening, history ownership, idempotent retries, uncertain outcomes, no support debit, duplicate Stripe events, amount mismatch, unpaid events, test-mode isolation, invalid signature, wallet reservations/insufficient balance/one-time capture and separation of old preview funds.
- test:access --connected checks real HTTP sessions, client/admin isolation, anonymous blocking of new help/credit/thumbnail/receipt routes and same-origin writes. No external calls or emails.
- Browser check with a temporary client account: navigation without Admin, title save/reload, real thumbnail, character modal and Escape, help question preset without sending, credit balance and disabled unconfigured checkout.

The temporary UI account is removed after verification. No user authentication settings are changed.
