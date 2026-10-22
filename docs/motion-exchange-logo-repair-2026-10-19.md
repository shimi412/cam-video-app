# Motion exchange and opening-logo recovery, 2026-10-19

## Observed failure

Production ae7b8699-8e43-40a0-a4ef-c272f59c6ae2, revision 1: the user requested CAM's logo on the first frame. The writer recopied the entire film. Technical comment boundaries changed, the assembler rejected four answers, then the model's patch anchors failed twice and its final patch omitted `after`. Seven recorded model calls cost $1.703132. The original paid turn and receipts are retained unchanged.

## Corrected exchange

New persisted operations use contract 3. Initial composition is a typed object with separate body, duration, subtitle excerpts, visual-timing expression, sound-cue expression and scene metadata. Application code inserts required technical boundaries; the model no longer copies the runtime or footer. Expressions are parsed as AST data, and generated helpers remain forbidden. Sandbox, timing, safe zones, narration, and encoded-frame checks remain in place.

A revision starts with the saved film as its patch base. The provider schema permits only an exact SHA-bound patch, not a whole-film rewrite. Scope validation runs before committing a candidate, preserving the last good base on rejection. Already assembled revisions preserve their footer byte-for-byte instead of reserializing it. A replayed patch returns the same atomic candidate after a crash. The correction output allowance starts at 1,000 tokens for a revision, within the unchanged total monetary cap.

Two consecutive identical tool rejection diagnostics, ignoring candidate hashes, stop further paid steps. The limit is derived from persisted messages and survives restart. This stop requires reconciliation and does not trigger a new paid recovery turn. A locally repaired validator can still accept the last saved answer without a new request. Legacy persisted contract-2 inputs and paid request identities are not migrated or silently resubmitted.

## Live recovery, no new paid request

Saved response and state archived in `storage/qa/motion-logo-repair-2026-10-19/`. The paid answer's intended opening logo was recovered locally into the existing first scene; its attempted unrelated full-file rewrite was discarded. The logo uses the existing CAM brand polygons, with a light backing so the navy segment remains visible on the navy opening background. It is visible on encoded frame zero. The old revision 0 remains intact.

Only scene sA source and its description change. Source for all ten other scenes is byte-identical under the production scope validator. Nine stable scene screenshots are hash-identical; sD has a 1-by-5-pixel antialiasing difference, SSIM 0.999999, with identical source. All encoded-frame comparisons pass the existing 0.96 minimum. Voice, paid agent turns, API receipts, credit ledger, reservations and quotes compare equal before/after publishing. Local failure history and source backup remain available.

The live job is now `board`, revision 1, with 11 animated scene cards and the complete 40.3-second preview. No storyboard, visual-film or finishing approval was granted by the agent. The user must review the new version normally. This repair does not assert that the user's artistic acceptance has occurred.

Proof: `storage/qa/motion-logo-repair-2026-10-19/recovery-proof.json`, `first-frame.png`, `checks.json`, `render-comparison.json`.

## Verification

New regressions inject raw model responses and run the real writer, sandbox compiler and browser checks for both initial structured authoring and revisions. They cover compiler-error correction, out-of-scope rejection without poisoning the base, SHA-bound atomic replay and identical rejection limits across restart. At the technical recovery checkpoint, 636 tests and the Motion browser journey passed, with TypeScript/lint passing. Shimi subsequently rejected the visual integration. The later contract-4 supervision change and 657-test verification are recorded in `docs/motion-supervision-2026-10-19.md`; this historical repair is not an approved artistic result. No tests use external model/media generation.
