# Client audit implementation · 2026-10-14

## Current status · 2026-10-15 storyboard correction

The sections below are a chronological audit, not a single current checklist. Current behavior and durable rules are recorded in root `MEMORY.md` and the client-facing support context in `support/MEMORY.md`.

Latest client corrections: exact planned preparation image count, per-scene comments and local text/symbol preview, individually quoted image revisions, semantic staging and camera variety, native full-frame instructions with conservative image-quality warnings. Changed compositions invalidate storyboard approval. The rejected test `348ec0f7-d804-4833-81fe-967dc0736e15` was removed at the user's request and its unused customer hold released; supplier receipts and original files remain preserved. The user is returned to the blank creation screen. No paid generation was launched in this repair session.

Verification uses injected provider responses and an isolated UI fixture; it does not certify the artistic quality of a newly generated live storyboard. New character or action changes cannot silently bypass sheet/endpoint requirements. Read the latest entries and operational memory before relying on older pending/delivered statements below.

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

## Character sheets remain pending

The Library enlargement does not fulfill the requested multi-view character sheets. The existing single-view images really are generation inputs, but sheet creation, human approval and sheet binding are still missing. The UI now labels them as original references. See docs/editorial-method.md for the required workflow. No new images were generated for this correction.

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

### 2026-10-15: preparation errors and model-free client wording

Client feedback: no model names in the production journey. Creation and conversation buttons now say “Prepare scenes”, with the preparation price retained. Production comparison cards no longer expose model names even to an administrator using that client screen; technical configuration remains in administration.

A real preparation response contained action durations under three seconds and an overlay over 100 characters. The director intake now accepts these recoverable bounds, then normalizes locally to a minimum three seconds (four for a state change) and a spoken-text excerpt under 100 characters at a word boundary. Narration is unchanged, actions over 15 seconds still fail, no automatic paid retry. Schema/provider errors from preparation become readable public messages. The previous rejected response was not saved by the strict parser, so this change does not claim it was recovered. No preparation or media production was relaunched. User explicitly requested to resume personally from the home screen.

### 2026-10-15: client trial feedback, storyboard-first reviews

Client requests are applied after the trial, without navigating or refreshing the user's tab. Added indeterminate animated feedback during preparation and production requests, with a delayed waiting message, reduced-motion support and no fictitious percentage or completed stages. Scene prose fields expand to their content without inner scrolling.

The production journey no longer displays the technical scene editor or the full directions list. Scene directions and individual start/end images are internal preparation steps; the connected controller uses the explicit `storyboard-first` policy. Automatic preparation records are marked as such, have deterministic identifiers for resuming safely, and never pretend to be human visual approvals. Existing saved rejections are honored. Complete storyboard approval remains a separately recorded human decision required before every first animation. Narration review, optional draft review, final clip checks, budget consent and character-sheet approval remain in place.

Storyboard cards prioritize images and the matching narration; detailed prompts and lengthy justifications are omitted. The full technical record remains available for internal audit. No paid preparation or production is launched to verify these changes.


### 2026-10-15: automatic storyboard preparation and mandatory drafts

The client starts a video, receives an automatically prepared budget, then approves it to prepare narration and the complete image storyboard. No separate voice, direction or individual frame approval interrupts this preparation; voice alignment and file integrity checks remain mandatory. The recording is available alongside the storyboard. Automatic preparation decisions remain explicitly distinguished from human decisions. Animation still requires human storyboard approval.

New unapproved connected quotes enforce draft-first and 1080p finishing server-side, even if an old client requests direct production. Unapproved legacy direct quotes must be refreshed before approval. Already approved productions retain their authorized route and model when renewed. Technical workflow/quality selectors and model comparisons are removed from the client journey. Only adapters with a qualified draft-to-final route can be selected (currently Higgsfield Seedance); unsupported routes fail closed, without direct-generation fallback. Draft review still precedes paid finishing. Existing spending ceilings remain unchanged. The script preparation fee remains disclosed separately before starting; the media quote itself does not generate media. No paid calls are used for verification.

Validation: 184 unit tests, TypeScript, lint and production build pass. The offline connected-controller scenario completes with five simulated submissions, three visual reviews (storyboard, draft, clip), zero network calls and zero credits. It verifies mandatory drafts despite a legacy direct request, stopping before animation, quote renewal, approved sheet upload, reconnect idempotence and three exports. Build retains existing broad storage tracing warnings.

### 2026-10-15: real-client quote preflight regression

A real eleven-scene script was blocked by “unfolds the hands”, incorrectly detected as an object transformation requiring a separate end image. Exclude only the hands/arms verb-object phrase from this heuristic; actual object unfolding and explicit state changes remain guarded. Quote errors now appear beside the retry action as well as above the script.

The real quote then exposed a second issue: three-second gestures were incompatible with the mandatory draft adapter minimum of four seconds. Model selection, quote lookup and generation payload now share supported source-duration normalization. The script, direction and narration timing are preserved; the existing montage uses the supported source. No unsupported three-second provider request or direct-generation fallback. Regression tests cover gestures, mixed hand/object actions and the quote-to-payload duration contract.

Verification: 192 unit tests pass, TypeScript and lint pass. A read-only quote for the actual reported production now succeeds (USD 2.65 + 3137.25 provider credits), remains unapproved, and submits no media requests. This conservative full-production quote exceeds the workspace ceiling; the client now sees that before approval, and the approval button is disabled. No spending limit was raised.

### 2026-10-15: authorized local testing ceiling

At Shimi’s explicit request to unblock testing, the local Higgsfield workspace ceiling was raised from 100 to 10,000 credits. The local USD ceiling remains 100. Existing provider-account reservations were preserved under the same database advisory lock while updating the stored budget ceiling. No quote was approved and no generation was triggered. Budget and storyboard consent still apply. A stale ceiling error clears when polling observes the revised limit. This local configuration is not a client-default change.

### 2026-10-15: saved narration spelling and stable progress

The reported recording stopped because Whisper transcribed “Defense” for the script’s “Defence” at word 52. Alignment now accepts this explicit spelling equivalence in both directions while retaining the exact script in captions and preserving all word timestamps, hash checks, word counts and overlap checks. No fuzzy matching or dropped words. Local verification of the already saved real recording passes for all 118 words / 11 scenes / 44 seconds, without provider calls or resuming production.

Production progress now follows the logical active/waiting/error state rather than the transient worker lock. Its heading no longer alternates between “voice alignment” and “Production in progress” on background polling. Errors display a stable “Production paused” state. The existing error is preserved until the user explicitly resumes saved requests, so this repair does not trigger paid scene generation.

### 2026-10-15: client handoff and network recovery

Removed decision/evidence and conversation/version links, provider request logs, model selection details and the full expanded script from the production screen. Script is an optional disclosure; budget has one explicit approve button. Running feedback follows persisted production state, not the worker lock. Public errors describe the next action instead of displaying raw transport strings. Budget, storyboard and visual approvals still gate the corresponding work.

Transport: bounded retries for GETs only. A POST is attempted once; only proven pre-connection errors can restore its existing budget reservation. Socket resets/timeouts remain ambiguous. Unknown image submissions can receive a separately quoted replacement attempt; the previous uncertain request and allowance remain saved. The updated budget must be approved before that new image is sent. Voice, prior completed images and selected models are retained.

Real reported run: voice and first two image requests completed; third image submission has no acknowledged ID. Read-only provider history returned the first two but cannot prove that the third was never accepted. A replacement quote was prepared, not approved: total USD 2.80 + 3137.25 generation credits, additional USD 0.15. Five existing request records remain preserved. No paid generation was launched during these repairs.

Controller rehearsal covers lost voice polling, proven-unsent image, accepted image with lost acknowledgement, explicit replacement budget, complete storyboard stop, draft review, final completion, quote expiry/renewal and exports in three formats. Injected providers only, zero network calls and zero credits. Live visual quality and successful real provider completion still require the user's test; a simulator pass is not a claim that the real film is finished.

### 2026-10-15 — Explicitly saved video library

At Shimi's request, My videos now starts empty and only lists jobs explicitly saved with “Save to My videos” on the production page. Migration 012 defaults existing and future jobs to unsaved. Saving is independent of production progress and does not trigger generation. Removing an entry from My videos clears its saved flag; production assets, request receipts and financial records remain intact. Save state lives in a dedicated database column to avoid races with production parameter updates. Verified TypeScript, targeted lint and save/remove database transaction with rollback.

### 2026-10-15 — Real transcript failure, removed test, customer-only credits

Removed test 1cf21b7d-8218-4ddd-bb78-e3153efb7dd2 using deleted_at (migration 013). List, library, direct job reads and the connected worker/action entry points exclude deleted jobs. Provider receipts and accounting evidence remain stored; deletion does not refund completed supplier operations. Customer holds were released; no unsubmitted supplier reservations remained for this job.

Root cause was a Whisper instantaneous interior anchor for “and” at 15.33 s, not overlapping speech. Keep this point timestamp unchanged only for isolated interior words from fal-whisper; malformed, boundary, consecutive, reversed, mismatched and out-of-file timings still fail. Local replay against the original 42.48-second WAV and all 118 words passes alignment and caption controls. scripts/verify-saved-reading.ts reproduces this using saved files without network calls.

Customer production UI now shows only the CAM wallet balance and CAM customer quote, including for administrators using that screen. Supplier caps, currencies and repair quote details are redacted from its API and removed from its UI. Removed supplier assistant allowances from the creation page. Approval requires an actual customer quote for every browser user; absent customer_pricing remains an explicit setup state, never a fabricated selling price or an administrator supplier-price bypass. The credit conversion/markup decision is pending Shimi's answer. The existing ledger remains USD-backed; no purchased credit balance or selling rate was changed.

Validation: 207 unit tests; real saved reading replay; full controller rehearsal with injected provider responses, failed submission, recovery quote, storyboard, draft, final and three export formats. No paid calls during fixes. These checks do not certify a completed real-provider video. User remains on a blank creation page.

Creation now checks commercial pricing readiness before paid script preparation and displays that setup state on the blank home screen. No supplier balance, supplier credit conversion or invented price is presented as the client's price. This is an outstanding commercial configuration dependency; do not describe the application as ready for an end-to-end paid customer test until it is resolved.


## 2026-10-15: scene duration pricing and saved list verification
- Removed blanket 15-second video quoting. Same action duration for quote and execution, including provider minima, draft and completion. Voice alignment changes montage timing, not paid source length.
- All existing jobs removed from My videos (`saved_to_library=false`); files/financial evidence retained. New videos remain unsaved until explicit Save.
- Running local dev server had continued serving stale catalogue behavior despite updated sources. Restarted launcher with persistent log output; verified the actual browser displays no saved videos. Do not claim list removal from database state alone.
- Proof: `storage/qa/my-videos-empty.png`. Offline controller rehearsal covers draft, review, final montage, interruption recovery and exports with zero provider/network calls.


## 2026-10-15: storyboard before animation pricing
- Corrected order for new/unapproved runs: small image-only budget, images, complete human storyboard review, cumulative video quote, second financial approval, narration and animation. Real API preparation is not described as free.
- No voice, alignment or animation is authorized by the image budget. Approving the storyboard returns without scheduling a paid worker; resuming cannot bypass the second budget.
- Kling is preferred for simple compatible actions with start/end frames. Seedance handles complex actions. No Hailuo route was activated. Draft and final remain separately quoted and reviewed.
- Models, providers and technical decisions remain hidden from customer screens. Storyboard button now says it leads to the animation price. Balance displays the funds reusable for this video, including its existing hold.
- Previously approved productions keep their original route; never-approved legacy quotes must refresh before approval. Imported-only storyboards may be reviewed for zero customer cost without a synthetic balance.
- The controller runs with injected providers for both Kling and Seedance, including two budgets, interruptions, image reuse, montage and three exports. These are orchestration tests; no actual provider video was generated or visually qualified.
- To fulfill the prior request to unblock local testing, issued a one-time USD 50 internal Bina test allowance via an adjustment ledger entry. Restricted to the local database with one administrator and no client accounts; not purchased credit, no payment/recharge. The first storyboard approval button is now enabled. This does not authorize the assistant to run paid generation.


## 2026-10-15: one launch, storyboard, then video quote
The mandatory image preparation cost is disclosed beside the creation button. Start my video directly prepares the images; the separate first budget approval screen has been removed. Human storyboard approval opens the video quote. Its cumulative total includes preparation exactly once, with the existing reservation/settlement semantics preserved.

A read-only price preflight is bound to script, options and actor. The launch validates its expiry, price and image-count ceilings before submitting media. An input change invalidates the displayed cost. Repeat clicks use the same request ID; a page visit cannot create launch authorization. Old unlaunched drafts can copy their saved script into the creation screen. No paid generation is used to verify this change.

Verification: creation-screen pricing is visible in the browser and updates when the script changes; Start remains disabled until the new price is available. The connected-controller rehearsals use the same automatic launch helper, stop at the human storyboard gate and require the later video quote approval; both available routes complete montage and three exports with injected responses, zero network generation and zero credits. These are orchestration proofs, not a live-provider quality certification. The user’s production was not started.

Final checks for this change: 296 unit tests, connected TypeScript, targeted lint and diff checks pass. A preparation price increase can be accepted with a refreshed launch notice on the same request ID before any media work; the saved direction is reused. Receipt renewal never crosses an existing approval or review.
