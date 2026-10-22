# Feedback execution audit, 2026-10-18

## Objective and limits

Shimi authorized repairs after stopping the test. No paid inference or media generation is authorized. Preserve the live production, original comments, approvals and completed assets. Verify the actual saved model response, then the complete browser/controller/worker/render path on disposable data.

Audit path: note entry and persistence → Claude request receipt/cache → typed-plan validation → scope and accumulated edits → pricing and exact-price approval → revised storyboard approval → independent worker → complete preview → later corrections → deferred finishing → final approval and downloads. Also exercise interrupted providers and worker/web restarts.

## Root causes found

1. The previous saved-case test injected a validated plan above the director validator. The latest raw Claude response was saved in the inference ledger but rejected before the controller's duplicate-scope repair. The test therefore missed the actual error.
2. An untimed duplicate of a uniquely timed note expanded to nine scenes. Animation directives included redundant render flags that disagreed with the motion operation, producing `Motion revisions require the visual-film stage and an animated shot.`
3. A scene previously rendered locally had no video-model lock. The selector incorrectly required an existing model for its first requested animation. First animation must be priced once; existing paid model choices remain locked.
4. Film edit maps were merged only at scene level, potentially dropping unchanged titles, graphics or motion from an earlier correction.
5. Saving derived interpretation/stage annotations changed the director cache identity. A failed price lookup could then request another analysis. Replaying an already received answer also unnecessarily depended on external pricing availability.
6. After a correction price was approved, the worker correctly stopped at storyboard review, but the interface hid the approval because its budget scope was already production. This was a complete user-interface dead end beyond the earlier price repair.
7. Edit feedback deleted the old locked note before the replacement was saved. Closing the browser while editing could lose it.

## Repairs

- Normalize exact duplicate scope before semantic validation. Compile a valid motion operation to its required animation mode; continue rejecting conflicting text-only instructions or motion outside visual-film review.
- Preserve original note IDs/text/times and bind every note to the combined offer. New animation routes are allowed only for explicitly corrected scenes, with all existing model locks/costs retained.
- Merge requested fields per scene. Explicit removals remain removals, unchanged approved fields survive.
- Keep cache identity stable across derived annotations; keep legacy request identity for already-paid receipts. Read settled inference receipts before external price lookup. Unknown submission outcomes still block resubmission.
- Expose `Approve changes & update film` at the correction storyboard gate and show planned movement. Approval is bound to the exact storyboard target and does not open another initial budget step.
- Editing retains the original saved note. Relocking replaces it atomically, checks its prior identity, invalidates an unapproved offer and supports idempotent retry.

## Verification

- Exact saved-case replay uses the latest raw response from the inference ledger, real director validation and real controller, with injected prices in an isolated schema. It additionally proves the next live inference identity matches the already-paid receipt. A price interruption reuses that answer. Only scenes 3 and 5 are priced; all 79 original JSON files are unchanged.
- Extended browser journey includes a priced two-scene motion batch, a formerly local scene becoming animated, correction-storyboard approval, a second local correction, editing/reload, and finishing/downloads. It uses real pages, controller, wallet, worker and rendering; only model/media transports are fixtures.
- Worker restart test covers an actual SIGKILL after acceptance, concurrent workers and unknown submissions.
- 571 unit/UI tests across 77 files pass. Full TypeScript and whole-repository ESLint pass; bundled vendor GSAP is excluded consistently for both motion and comics.
- The separate motion browser journey passes through download. Full-film tests pass for legacy draft/final and Whimsical workflows, including a failed middle scene, preserved completed receipts and a separately authorized replacement.
- The connected worker was gracefully reloaded only after verifying zero eligible live jobs or queued exports. Its supervisor started PID 31320; web PID 36299 stayed unchanged. The real test remains awaiting draft-film review with its three notes and all 79 JSON hashes unchanged.

Evidence: `storage/qa/current-film-feedback-proof.json`, `film-feedback-batch-proof.json`, `worker-restart-proof.json`, `motion-journey-proof.json` and `feedback-audit-activation-proof.json`. The extended Clay browser journey passed through all three downloads at 16:21 UTC. `client-journey-proof.json` records both correction cycles, atomic edit/reload, exact-price approval, preserved graphics and narration, deferred finishing, final-file approval and zero external calls. `feedback-audit-summary.json` contains the verification counts and hashes of all eight evidence files.

 Offline media prove orchestration and preservation, not the artistic quality or uptime of a paid provider. The director consumes script, prior decisions, stills and sampled film frames. It does not continuously watch/listen to a film and cannot execute an operation absent from the application's tool contract. The failures above were contract, state and UI integration defects, not evidence that another prompt alone would fix the application.
