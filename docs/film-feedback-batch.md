# Film feedback batch repair — 2026-10-18

## Behavior

- Lock feedback saves one original note/time. It performs no inference, pricing or generation.
- Apply all changes submits the selected locked notes in one director call. Local operations accumulate; additional media receives one combined price, with explicit approval before submission.
- Every visual note and timestamp is bound to the correction offer. Editing, withdrawing or explicitly deferring an included note invalidates an unapproved offer. Existing single-note correction records remain compatible.
- Compatible finishing settings produce one render intent. Conflicting instructions remain unresolved, without partially applying a batch.
- Finishing feedback survives visual corrections and approval. An ending transition can be deferred even if its requested effect is not supported yet. A timed comment on the logo closing no longer fails before analysis. Keep for finishing provides explicit routing without inference or deletion.
- Motion-only feedback can request a replacement clip using the same approved images, narration and duration. The director writes a concrete motion instruction; only that clip is repriced. Image regeneration remains separate. Human storyboard and price approvals still apply.
- No automatic replay of the user's notes. The user presses Apply all changes after this repair.

## Evidence

- `storage/qa/film-feedback-batch-proof.json`: disposable clone of the actual saved production, real controller, injected director/prices, network denied. Locking two notes starts no work; one visual analysis/quote, unchanged approved price, local-only scene not regenerated, motion-only offer preserves images, closing feedback deferred, one finishing intent. Original JSON files hashed and unchanged. No media worker or real provider calls.
- Unit/UI regressions cover multi-note submission, pending state, text preservation after failure, editing/relocking, timestamp binding, conflicting edits/settings, motion tool scope and stale/missing notes.
- Full unit suite: 564 tests across 76 files pass. Connected TypeScript and targeted ESLint pass.
- Browser journey uses isolated database/wallet, real pages/controller, explicit director/media fixtures, and local rendering. It tests two locked notes, one Apply all changes in visual review, deferred notes surviving reload/visual approval, one finishing batch, final approval, saving and downloads. Passed through all three downloads with zero external calls and zero paid generations; result: `storage/qa/client-journey-proof.json`. The live production worker was gracefully reloaded at an idle human-review gate; the web server stayed running.

## Limits

No new real animation or paid inference was launched by the repair. The quality of a newly generated motion revision still requires the client's review. Arbitrary new transition effects, narration restructuring and duration changes are not implemented by this change; finishing notes remain pending until an available correction is chosen/applied. Comics preparation is still isolated.

## Exact saved-case follow-up (2026-10-18)

The client still could not apply the actual three saved notes. Replaying the saved Claude plan identified `An approved scene model is missing`: scene 3 had previously been local and had no video model, while an untimed duplicate of the scene-5 note had also been expanded to all nine scenes, including text-only scene 9.

- Exact duplicate notes reuse the unique timestamped note's semantic decision. Both original notes and hashes remain; ambiguous multiple timestamps cannot expand to the whole film.
- A scoped correction may price a first video operation for a previously local scene. Existing models remain locked. First operations are not charged as both an original and a retry.
- `scripts/check-current-film-feedback.ts` replays the actual saved plan with injected prices and no network on a disposable database/storage copy. `storage/qa/current-film-feedback-proof.json` proves only `scene-3-clip` and `scene-5-clip-retry-1` are added, all old video prices and approvals remain, three notes survive, a repeated click reuses the quote, and 79 source JSON files stay unchanged. No live quote or correction was applied by this test.

## Validator and complete-cycle audit

The earlier plan-injection replay did not exercise the validator that rejected the user's latest raw response. That gap and the additional hidden correction-approval button are corrected and documented in `docs/feedback-reliability-audit-2026-10-18.md`. The current saved-case proof checks the exact inference receipt identity, runs real validation and simulates a failed price lookup followed by reuse of the same answer. Editing now preserves the locked original until atomic replacement, and successive scene patches retain unchanged approved fields. No paid call or live correction was initiated.
