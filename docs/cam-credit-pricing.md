# CAM credit pricing

## Current policy: adaptive-v1 (2026-10-18)

Shimi requested a decreasing markup as supplier cost rises. Apply this curve once to the **cumulative supplier budget**, then round upward to a whole USD. The same function prices preparation disclosures and customer quotes. Already approved prices are preserved.

| Supplier estimate C (USD) | Customer total before whole-dollar rounding |
| --- | --- |
| 0–15 | 2 × C |
| 15–20 | C + 15 |
| 20–30 | 25 + C / 2 |
| 30–35 | 40 |
| Above 35 | C + 5 |

Examples: $10 → $20; $20 → $35; $25 → $38; $30 → $40; $35 → $40; $36 → $41. The usual $30–40 target is not a universal cap: above $35 supplier cost, a $5 gross margin requires an explicitly higher customer price. This is gross margin before fees, overhead and unbudgeted incidents, not net profit.

1 CAM credit remains USD 1. Supplier credit conversion remains the configured internal estimate. Never apply this curve per scene or add the already-reserved preparation price again. Updating an unapproved price replaces its identifier so a stale approval cannot reserve the wrong amount. Other stored quotes are preserved; new quotes use the selected policy.

Test 05: supplier allowance $27.485, old customer quote $55, revised customer total $39. Existing $4 preparation reservation retained. No generation or approval was performed. Proof: `storage/qa/adaptive-pricing-proof.json`.

The admin pricing screen explicitly selects Adaptive margin or legacy Fixed multiplier. A missing mode in historical settings means legacy fixed pricing; the connected workspace is now explicitly configured as adaptive-v1.

## Historical decisions and evidence (superseded pricing formula)

Decision applied 2026-10-15 following Shimi's request to calculate a reasonable margin. Customer production quotes show USD, not credits. Supplier rates and margin are internal.

- 1 CAM credit = USD 1, consistent with existing USD-backed wallet and Stripe top-ups. No balances were created or modified.
- Future production quote = supplier budget expressed in USD × 2, rounded upward to the whole dollar. This is a 100% markup, or 50% gross margin before fees, incidents and fixed expenses.
- Internal credit valuation: USD 0.05 per Higgsfield credit as a conservative replacement-cost allowance. Read-only provider pricing on 2026-10-15 offered 600 credits for USD 30; smaller one-off packs were below this rate. This is not a verified historic subscription acquisition cost. No recharge/auto-refill/subscription was activated.
- Reserve assumptions for planning: 8% of selling price for payment/FX/fixed payment fee allocation; 10% of supplier cost for generation incidents. At ×2, contribution after these two provisions is 37% of selling price. These are assumptions, not actual billed fees or net profit.
- Example: supplier budget USD 10, customer price USD 20, payment provision USD 1.60, incident provision USD 1, remaining USD 7.40 before fixed expenses and tax.
- Fixed hosting/support/maintenance must be covered by the maintenance contract. Pricing does not establish that the project is profitable overall. Revisit against actual receipts and production volumes.
- Approved customer prices remain immutable. Never-approved fractional quotes are replaced under the wallet lock with a new identifier and rounded to whole dollars; stale approvals cannot reserve them. Charges are reserved on approval and settled on completion, using existing wallet logic.

Production budgets now price each planned action duration (`actionSeconds`, or the storyboard estimate `clipSeconds` for older scenes), rounded to provider-supported seconds. Quote and execution share that duration before and after narration alignment; the montage adds local holds while retaining the complete recording. No blanket 15-second allowance. Draft and final are both included; duplicate provider requests for equivalent supported durations are collapsed. Imported scenes are excluded. Actual submission is still checked against the approved duration and price. A longer creative action requires a revised budget.

The supplier budget remains an estimate, not reconciled actual cost. Supplier uncertainty, pricing changes, failed productions, taxes and refund terms still need operational reconciliation.

Superseded intermediate verification 2026-10-15 (before restoring Kling priority): the 11-scene test b38d50af went from 165 reserved animation seconds to 46 supported action seconds (4–5s per scene, plus draft pass). At current quoted prices and configured ×2 markup, customer quote fell from USD 320 to USD 93, rounded up. No generation, customer debit or wallet grant was executed.

Reference: Stripe France standard pricing https://stripe.com/fr/pricing (checked 2026-10-15). Actual fees depend on the merchant account, card and currency. The 8% provision is not a quote from Stripe.

Shimi clarified on 2026-10-15 that the approximately USD 10 target is Bina's supplier production cost, not the customer selling price. It is a cost-design target, not a fixed price for every duration or a justification to hide actual costs. With the current ×2 rule, USD 10 supplier cost implies USD 20 customer total.

Current journey: disclose a mandatory preparation ceiling beside Start my video; that click authorizes and starts storyboard images directly. There is no intermediate image-quote approval screen. After human storyboard approval, calculate the cumulative animation/voice/finishing quote for explicit approval. The previous reservation is reused, never added twice. The images are not free at the provider: the current 11-image test is USD 1.65 supplier cost and USD 4 customer reservation, rounded once on its total. When all storyboard visuals are already imported, the image quote can be zero and no customer hold is created. No funds or purchased balances were added.

Current read-only full-run allowance for the same 11-scene script after the Kling routing change: USD 15.0825 supplier, USD 31 cumulative customer total at ×2 rounded upward. This is not the quoted image-only first stage and no animation quote was approved. Generic fal API rates returned USD 0.14/s for both Kling variants, while public model pages list different audio-off rates (USD 0.084 Standard, USD 0.112 Pro). The software currently keeps the conservative API allowance; the approximately USD 10 supplier target is not yet established by reconciled billing. No discount was inferred. Proof: storage/qa/current-pricing-verification.json.

Local test funding 2026-10-15: following the request to unblock testing, added exactly one USD 50 customer-wallet adjustment marked “Bina-funded internal testing allowance”, not a purchase. The script checked a local database and one administrator/no client users, used the wallet advisory lock and an idempotent note. No provider recharge, Stripe payment, quote approval or generation occurred. Browser confirms USD 50 available and the USD 4 storyboard button enabled. Remove unused test allowance before client handover; the ledger keeps its provenance.


2026-10-15 launch disclosure, corrected after client review: a read-only preflight builds the planned starting/ending image manifest and reads the current image rate. One starting image per scene; an ending image is included only for a planned transformation. There is no two-images-per-scene reserve. The short-lived authorization binds exact image operation IDs, script/options and actor. For 11 starting images at USD 0.15 each, supplier cost is USD 1.65 and customer price is USD 4 at the configured ×2 markup and whole-dollar rounding. That is not a universal price for every storyboard. The director must preserve those planned image slots; adding an unplanned end image cannot silently consume the former blanket allowance. Accepted legacy receipts remain resumable; new launches must refresh old notices. The image-only reservation cannot exceed the displayed price or supplier ceiling. No voice or animation fits this initial authorization. Replaying the same launch reuses the existing preparation and requests.
