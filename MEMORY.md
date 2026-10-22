# CAM project memory

Updated: 2026-10-20. This file records product decisions from the CAM audit. It is project context, not private workspace memory. The marked editorial section is intended for the production director; the implementation status below must never be injected as creative instructions.

## Current handoff, 2026-10-21

Late afternoon decisions by Shimi: (1) Motion has no storyboard step any more; V1 is a complete film, the client gives general feedback, then V2, V3 (service goes to `visuals` after each build; page shows "Version N of your film", one feedback box, scenes collapsed with review notes). (2) Motion narration voice is Bram (`CAM_MOTION_VOICE_ID`, code default). (3) `CAM_MOTION_EFFORT` now drives the Claude reasoning effort; Opus 5.5 is available on OpenRouter for more dynamic writing, to be chosen by Shimi. The live test « Test 21 oct » (e3fa2d9a) reached V1 ($3.46); the quote card folds the per-scene interpretation under a details toggle; a revision may now retime the VIS/MARKS data lines.

Shimi authorized spending to make the software work. Thirteen live resumes on test 57a06953 each exposed an executor defect, all fixed and tested (see `docs/motion-contract-repair-2026-10-20.md`): canonical turn identity across JSONB, cache-aware reservation bound (prompt cache verified live, 0.1x reads), patch edit diagnostics and protected boundary lines, actionable visual diagnostics (subtitles, removed-word opacity timeline, hold rule with the transition-gesture exception, events without duration rejected), review frames sampled mid-event and every half second with a versioned evidence identity, revision lineage for the repair base, Resume able to continue or re-pin a saved repair turn with journaled reconciliations. The candidate `1b3a1025…` passes every technical check and was rendered locally (`storage/qa/motion-real-candidate-57a06953/render-1b3a1025/preview.mp4`), but the frame-based Claude review kept asking for proof frames and one real defect remained (overlapping lines in the last scene). Decisions of 2026-10-21: the Claude visual review is consultative (recorded, shown per scene, human judges); test 57a06953 is abandoned with its receipts ($6.63 total); Shimi will start a new $10 Motion creation. Nothing is committed. Not delivered: the corrected executor has not yet produced a film that Shimi accepted.

## Previous handoff, 2026-10-20

Evening update (Claude): root cause confirmed in the saved turns: contract 4 copied the model's scene-keyed, quoted `visualTiming` into the footer `VIS`, overwriting the composition's correct map, and returned an assembled-file traceback the model could not act on (five identical patches; the stale worker lacked the identical-rejection stop). Fixed on disk: contract 5 time values as numbers or unquoted expressions, derived transitions/dur/logo_net, optional film accents, `null` patch metadata, footer-free writer brief, current diagnostic + provisional sandbox build pinned in the repair input, no retry-saved after an internal allowance, exact per-step reservation bound, definitive 400/422 refusals, prompt cache behind `CAM_AGENT_PROMPT_CACHE` (off, unverified). Real candidate with corrected data lines still fails holds/offsets/duration: Claude's creative retiming is the next paid step (≤ $1, needs Shimi's go). 690 tests, TypeScript, lint; worker reloaded 17:51. Evidence: `docs/motion-contract-repair-2026-10-20.md`, `storage/qa/motion-real-candidate-57a06953/report.json`. Still not delivered.

Shimi hands the project to Claude. Read `HANDOFF-2026-10-20.md` first. Client Motion 57a06953 remains blocked; no paid calls or live-state changes during this repair. Contract 5 now pins failedFilm and numeric timing; legacy missing-base replay works but exposes conflicting sound configuration in the received patch. Internal request cap is not customer budget. Resume is visible, not clicked. Web reloaded automatically; production worker NOT reloaded. All work is on disk, not committed/pushed. Full suite: 679 pass, one file-stream timeout; isolated rerun including recovery: 18/18. TypeScript/lint pass. Handoff records final isolated journey and backup evidence. Do not claim delivery readiness.

## Durable product decisions

- Motion Start: no revision-price teaser or promotional discount. Price corrections when requested, before execution (Shimi, 2026-10-19).

- Keep the interface simple: script, disclosed preparation cost, visual storyboard, comments, approval, video price in USD, complete low-resolution film, approval of that film, high-quality finishing. Hide model/provider names and technical switches from clients.
- The customer pays Bina's displayed price. Supplier costs, provider balances and currencies stay internal. Approximately $10 is a supplier cost target, not a universal promise. Round the customer total to a whole dollar; never silently double all image counts.
- Human storyboard approval is mandatory before animation. A budget approval or automated file check is not a visual approval. Narration, approved character sheets, complete words, audio fades and the final CAM logo remain production requirements.
- The low-resolution gate covers the complete edited film, not each scene: generate all draft clips, assemble with narration, captions, graphics, fades and CAM ending, then request one human approval before any high-quality request. The script and storyboard are collapsible; the newly actionable step receives focus once and appears above them. Return to storyboard reopens it without disrupting production.
- Feedback exists at two independent levels: whole video and individual scene. Keep the global instruction with the video; preserve scene comments and drafts when applying it. Global changes must report their real scope and require a price approval before any image regeneration.
- Current storyboard feedback rule (2026-10-18): write scene/global notes, Lock feedback for each without processing, then Apply all feedback once. Additional media requires one disclosed batch price and explicit approval. Notes remain editable and isolated by scene; failures preserve previous images and do not hide controls or stop other scene revisions. This supersedes the immediate Apply change workflow recorded in earlier history below.
- My videos lists only explicit saves. Removing a test from the product preserves supplier request receipts and financial history.
- Shimi gives feedback progressively. Do not alter the page or running test until instructed. His 2026-10-15 instruction to return home, remove test and apply repairs authorizes this repair session, not new paid generation.

## Reliability integrated, 2026-10-18

Latest audit: docs/feedback-reliability-audit-2026-10-18.md. The reported motion error was missed because an earlier test bypassed the director validator. Raw saved-response replay now passes the actual validator and proves the next request matches the already-paid receipt. Scope normalization precedes validation; motion mode is compiled, new animation is priced only for scoped local scenes, and prior per-scene edits survive. Derived annotations no longer cause new inference after a price failure. Editing a film note preserves its saved version until atomic replacement.

The extended browser test also exposed a hidden correction-storyboard approval after production pricing. Approval is now separate from initial editing permissions and bound to the current target, with planned motion visible. Worker activation kept the web server, all 79 source JSON files and three locked notes unchanged. Final verification: 571 tests / 77 files, full TypeScript and ESLint; Clay browser journey through two correction cycles and three downloads; motion journey through download; worker restart and failed-middle-scene recovery. Evidence: storage/qa/feedback-audit-summary.json and the audit report. These checks use isolated data and injected provider responses, not paid generation or artistic acceptance.

## Storyboard feedback repair and model audit, 2026-10-18

### Local storyboard quote expansion, 2026-10-18

Test 8bf03e02: text-only feedback changed the plan metadata fingerprint, so expanding the approved storyboard price into a video price failed. Permit the transition only from the exact original storyboard plan, with exact human approval and unchanged non-video operations; preserve all attempted costs and the original approval. Never relax ordinary production reprice checks. Verified: 555 tests, TypeScript/lint, isolated saved-case replay preserving 42 source JSON files (`storage/qa/saved-local-quote-proof.json`), simulated prices, zero external/paid calls.

### Applied feedback visibility, 2026-10-18

Test 8bf03e02 scene 9 was already applied as textOnly, not merely locked. Do not resubmit this analysis or generation to unblock the user. The batch UI now replaces an empty disabled Apply button with an applied confirmation and next-step instructions, shows one text-only composition and hides character references. Regression: 38 focused tests, TypeScript and lint pass; read-only rendering of the saved test proves the old image is absent (`storage/qa/scene-9-feedback-display-proof.json`). No paid calls or production-state changes. The reported screenshot's older image was not reproduced by the current saved-view renderer; do not claim a proven cache root cause.


### Claude as the supervising director, same-day follow-up

Shimi explicitly corrected the architecture: Claude must understand and decide throughout the creative process, especially feedback; code is the execution machinery for those decisions. This supersedes the bounded-keyword feedback implementation described in the diagnostic below.

- Initial semantic direction requires Claude and now declares motionComplexity. The adapter resolver executes that declaration using verified capabilities/prices; already-paid legacy plans remain intact.
- Connected Apply all feedback calls `feedback-director.ts` with the full script, current storyboard, production-specific history, each original note and its allowed scenes. A hash-verified contact sheet supplies actual image pixels and local layers. Film feedback additionally supplies sampled frames from the exact reviewed film. Finishing feedback uses the same director and current settings.
- Claude returns typed operations: local composition, image editing brief, character identities, finishing settings or clarification. The original comment is preserved separately. Only script excerpts or explicitly quoted replacements can become visible text. Unknown/unsupported requests stay unresolved, and model failure never falls back to keywords. Legacy immediate-apply endpoints are rejected by the connected HTTP route in favor of the batch workflow.
- Plans are persisted by exact input, and inference uses the existing Claude/OpenRouter request ledger, included-workspace accounting and $0.25 request bound. No automatic billable retry. No model or media call was made during this integration; tests inject explicit model responses.
- Local film corrections reopen storyboard review, retain original receipts and prohibit new media submissions (`reuseOnly`). Priced corrections bind both original notes and the compiled image instructions to approval, so neither can change after the price is shown.
- Current limitations: this is a tool-using director, not arbitrary self-modifying application code or continuous playback inspection. Still-frame analysis does not prove movement or audio quality. Narration re-cuts and changes outside the available choreography/finishing tools are explicitly unresolved rather than falsely applied. Human storyboard, visual-film and final finishing approvals remain mandatory.
- Activation: worker reloaded; its old textOnly-schema error was cleared only after the current schema accepted the saved edits. The test remains awaiting storyboard review with no background kick.
- Verification: 553 tests / 75 files, TypeScript and ESLint pass. Isolated saved-case replay keeps 39 source files unchanged; full-film simulated render proves local corrections reuse all media. Zero paid or external generation calls.
- Whimsical updated to the implemented division of responsibilities: https://whimsical.com/4P7us9wnGGWh3wo2kjRNV6 . Details and offline evidence are in docs/claude-director.md.

### Earlier feedback diagnosis

Historical keyword-based repair and its evidence are archived in docs/feedback-repair-history-2026-10-18.md. The semantic director described above supersedes that implementation.

## Narration recovery verified, 2026-10-18

- Test 05 (`25c5641f-b583-491f-937b-818b91943f5c`) paused before animation because the saved transcription split `long-standing` and `century-old` and recognized `help` for the script's `helped`. The original audio and all storyboard files existed; this was not an image-generation failure.
- `voice-alignment.ts` now joins explicit hyphen continuation chunks after checking their raw timestamps. Only listed spelling equivalents are accepted; actual word/tense/negation changes still fail. `local-voice-alignment.ts` provides one free local transcription fallback on a live word mismatch. It uses the installed medium model without a script prompt, checks the complete text and all measured timestamps, and caches raw evidence against audio/script/original alignment hashes. It never resubmits narration or transcription, downloads a model, or fabricates timing. Configure `CAM_ALIGNMENT_WHISPER_MODEL` / `CAM_ALIGNMENT_WHISPER_BIN` if the existing local installation is elsewhere. Missing tools or an unresolved discrepancy stop with a specific support message.
- Verified the actual 54.8-second recording: 129 words, 10 scenes, valid caption timing. `storage/qa/saved-reading-25c5641f-b583-491f-937b-818b91943f5c.json` records unchanged original production/checkpoint/request hashes and zero paid calls. Repeat safely with `scripts/verify-saved-reading.ts <job-id> --recover-local`; this only writes the local evidence cache under the job lock, never starts production.
- Replayed the actual saved chain in a temporary copy with all network/provider actions forbidden and an in-memory budget snapshot. All prior images, voice and transcript were reused; the recovered alignment passed and execution reached the first animation (`scene-1-draft`, 6 seconds), covered by the approved quote. Deliberately stopped before submission. Evidence: `storage/qa/narration-recovery-replay.json`. The live job remains paused for Shimi's Continue my video click. No live animation or final-film success claimed.
- Verification: 519 tests / 69 files passed; connected TypeScript and lint on touched files passed. Repository-wide lint is currently blocked by the separate vendored `comics/template/assets/gsap.min.js` (8 errors, 191 warnings), outside this repair.

## Editorial rules consumed by production

<!-- CAM_DIRECTOR_RULES_START -->
CAM editorial contract, version 2026-10-18-r6.
Read the entire original script before choosing any narration boundaries. Choose beats by idea and meaning, never by word count, line breaks, sentence count or a provisional image allowance. A question and its answer may form one beat across sentences; a single sentence may hold distinct ideas. Record the idea, editorial boundary reason and continuity for every beat. Check animation duration only afterward; choose a meaningful continuation for a long idea, never mechanically chunk its words. Preserve every original word and punctuation in order.
Start with what each narration passage must communicate. Choose a concrete visual treatment: a literal miniature setting or object/action when useful, explanatory graphic composition, or presenter with concise animated words when that is clearer. Avoid forced metaphors. Do not turn that preference into presenter-only scenes across the film.
A narration comparison is one idea: show both compared subjects and their relationship in the same composition when readable, for example a clay balance or side-by-side objects. Read the neighboring passages before choosing a visual; a country name completing a comparison is not an independent narrative beat. Do not mistake a word-count boundary for a creative decision. If a long idea spans multiple clips, preserve its comparison and continuity across them.
Design the sequence as a whole. Adjacent shots should progress in information, composition and action. Vary shot scale, angle, setting and lighting when motivated by the story; maintain coherent continuity within a setting. Small hand gestures in the same front-facing studio are not sufficient narrative variety. Each visible prop or graphic must have a clear link to the spoken passage.
Character sheets lock identity, proportions, materials and wardrobe. They do not lock pose, expression, camera angle, light or background. Existing characters use approved sheets. When scene feedback introduces a new character, prepare its identity sheet internally before the revised scene, include both in the displayed price, and use its exact file as a reference. New sheets are provisional storyboard assets; human approval of the complete storyboard binds them before any animation. Do not ask the client to manage sheets or silently replace the story with a static presenter.
The clay material style applies to every visual object, including religious symbols, assembly emblems, badges, floating medallions and small decorative graphics. They must read as sculpted clay, with thickness, softly rounded edges, visible material and coherent light/shadows, not flat vector stickers pasted over the scene. Only subtitles and animated text may use a different graphic style.
Plan typography as local editing layers. Floating badges, medallions and icon overlays are never automatic. Start with graphicLayers=[]; only a specific client instruction for this production may add them. An earlier film's religious badges are not a style template for later films. Concrete clay objects and flags can illustrate the current narration inside the set. Show requested local layers in the storyboard, then animate those same layers in the film. Do not assume arbitrary free-form feedback has been implemented; track its result and require review of changed compositions.
Generate one continuous scene filling the selected aspect ratio edge to edge. Reference sheets are identity references, never a square panel to reproduce. No inset picture, padded strip, letterbox, duplicated background band or collage border. Quiet space for captions/graphics must be part of the continuous set, not an added panel. Keep faces and important actions out of caption/UI safe zones.
Use one starting image per scene by default. A genuinely changing object state needs a specified final image; retain that second image only for the planned transformation. For an existing production preserve its authorized image manifest and budget. A new Start chooses the actual image needs after semantic planning; its provisional allowance never determines narration boundaries. Do not add unused alternative takes or speculative ending frames.
Preserve the exact approved narration and its language. Visuals illustrate the supplied message without adding factual claims or pretending to verify them. The human reviews the complete composed storyboard before any animation. Paid generations and retries never follow from documentation changes alone.
The production journey separates visual decisions from finishing decisions: composed storyboard approval, video budget approval, complete assembled visual preview, high-quality completion, then a distinct sound/editing/subtitle review before download. During visual review, explain that sound, editing and subtitle requests are retained for the following stage; never convert them into billed image regeneration.
Route a scene by its actual needs. Prefer Kling for compatible actions using approved frames, Seedance draft/continuation for complex motion, and local motion design for presenter/text treatments. Reuse approved media during finishing; change only the affected scene for scoped visual feedback. Model names and supplier accounting stay internal.
<!-- CAM_DIRECTOR_RULES_END -->

## Findings from the interrupted client test, 2026-10-15

Test `348ec0f7-d804-4833-81fe-967dc0736e15` reached an 11-scene storyboard. All 11 directions used presenter-text with essentially the same studio. The first imported PNG already contained horizontal bands around a square central composition. The import path resizes proportionally and does not add those bands. Dimension checks alone missed the visual defect.

The old storyboard had one global note saved on approval/rejection, with no consumer that revised the scenes. It did not support local symbol layers. The launch preflight reserved two images for every scene: $1.65 supplier estimate for 11 images became a $3.30 supplier ceiling and $7 customer ceiling at the configured ×2 markup. These are identified defects, not acceptable defaults.

## Implementation and verification status

Implemented and checked locally on 2026-10-15:

- Exact signed image-operation manifest at launch. The eleven-scene client script shows eleven images and a $4 customer preparation price in the actual UI at the configured pricing, rather than a speculative two-image-per-scene ceiling. Its image supplier estimate is $1.65; customer and supplier prices remain distinct.
- Runtime director loads only the marked editorial section above on every new preparation, with a content hash. The file is included in runtime packaging. Scene-specific staging, camera/light variation, physical-state normalization and same-budget repair of obvious repetition are in place. Custom human directions are not silently replaced by the automatic repetition repair.
- Persisted per-scene comments, supported local title/symbol changes visible in the storyboard and montage, and individually quoted image revisions for framing, setting or light. Revisions bind the exact comment and price; changed comments invalidate the offer. Unchanged image requests are preserved. A changed storyboard requires human review again.
- Image-only feedback cannot silently introduce new cast, a physical transformation or a changed duration. Such requests remain visibly pending until their character sheet or action plan is prepared. The software does not claim arbitrary comments are fully understood or applied.
- Native continuous-frame instructions, original image bytes preserved, and conservative format/padded-band warnings. The reported first image is flagged; the other ten do not trigger that specific warning. Absence of a warning is not artistic approval.
- Same-operation image fingerprint changes on legacy resumes are blocked before a new submission. Explicit revisions use separate quoted attempt identifiers.

Verification: 333 unit tests across 50 files, connected TypeScript, targeted ESLint and whitespace checks pass. Both full connected-controller scenarios, with injected Kling/Seedance responses, complete storyboard feedback, explicit image-revision pricing/approval, fresh storyboard review, draft/final rendering and three exports. Each reports zero network calls, zero paid calls and zero credits. Their voice and image fixtures are local test media, not a new Bram production. Browser inspection verified a text correction survives reload, an image correction remains pending until pricing, symbols do not overlap the title, and the eleven-image preparation price is displayed before launch. Temporary QA data is removed after inspection.

Limits: no new paid image or video was generated, so the next real storyboard still needs human assessment. The band detector and editorial heuristics are conservative. Model weights were not fine-tuned; the operational memory, prompts and executable rules now carry these corrections. Do not describe these tests as proof that every live provider or every artistic result will succeed.

On 2026-10-15 the user requested removal of the test and a fresh start. It was soft-deleted and removed from saved videos; its $4 unspent customer hold was released. Historical supplier spending and original files remain preserved. No paid generation was submitted by this repair session.

## Earlier feedback interaction repair

The 2026-10-15 implementation history is preserved in docs/feedback-repair-history-2026-10-18.md. The later locked batch workflow supersedes it.

## Archived sections

The 2026-10-15 sections (internal character preparation, complete-film preview, provider preset notice, failed animation recovery, replacement price feedback, alternative route for the failed sixth draft, optional breathing, feedback on the complete film, scene-six lineage audit, film correction workflow, session stopped 18:06) now live in `docs/memory-archive-2026-10-15.md`. ⚠️ MEMORY.md must stay under 80,000 characters: the director memory reader refuses a longer file and every Collage production then stops before images.

## Whimsical alignment and separate finishing review, 2026-10-18

Original board retained: https://whimsical.com/zanavi/le-client-choisi-sa-categorie-de-video-Mj8eyL9mTFj6p3oYGH37qh . Approved reference board: https://whimsical.com/WGcXVa7ucQvbchK7siW1EJ (CAM Clay • Parcours vidéo et validations • 18 octobre 2026). Created through the official authenticated Whimsical MCP, then inspected and opened in Chrome. **Parcours validé par Shimi le 2026-10-18 : « Oui, je valide ce parcours ».** This approves the workflow: storyboard approval, complete-film visual approval, then separate sound/editing/subtitle approval before download. It does not approve any individual film, authorize paid generation, or establish that all implementation gaps below are resolved.

Implementation adds a prominent video journey and a separate `finishing-film` review after full-film visual approval. Local settings adjust music level, pauses, subtitle visibility/size/text and CAM ending using the approved render packet. The final target binds file hash and settings; download/output publication and credit settlement wait for final approval. Local editing failures preserve the previous playable version and unresolved feedback. Free-form commands are deliberately bounded: unsupported or multi-part requests stay pending and point to explicit settings, never silently marked applied. Timed music edits, replacing music/voice, arbitrary montage instructions and arbitrary semantic feedback interpretation are not implemented by these controls.

Visual-preview feedback is classified locally as visual, finishing or mixed. Finishing-only requests survive to the final review without blocking visual approval; mixed requests require separation. This is deterministic routing, not model training or unrestricted AI editing. Global visual notes no longer imply regenerating all shots: explicit scene/time/first-frame scope is respected; ambiguous scope requests clarification.

New jobs opt into `productionMethod: whimsical-v1`: compatible Kling clips are generated once and reused after whole-preview review; Seedance retains draft/1080p continuation; presenter-plus-text scenes use local animated text over their storyboard image. Legacy jobs keep their approved animation contracts. No existing test, paid request, storyboard or approval was migrated or changed by this work. No paid generation was launched.

Remaining creative-method gap: arbitrary new characters in the initial AI scene breakdown are still constrained by the current cast schema; the existing automatic internal sheet path is verified for scene feedback introducing supported roles. Do not claim that merely recording a broad character rule fixes this initial-planning limitation. The new board is a requested target workflow, not proof that every creative branch or arbitrary feedback works. Human artistic acceptance remains outstanding.

Verification for the 2026-10-18 changes: 127 targeted unit/UI tests pass, TypeScript and targeted ESLint pass. The connected-controller rehearsal, with network disabled and injected provider responses, reaches the separate finishing approval and exports all three formats; zero network calls, zero paid calls. An export bug found during this rehearsal was fixed: the original-format copy must also carry its reference audio mix for quality checks. The Whimsical rehearsal separately verifies one native Kling request reused after visual approval, a local text scene without an animation request, and actual local subtitle/music finishing. These proofs establish orchestration only, not live visual quality or full delivery acceptance.

## Client journey integration, 2026-10-18

The creation screen now shows the same video journey as production. Unsent film feedback and unapplied finishing settings disable approval of the previous version. Feedback and settings controls have separate React keys, preventing conflicting component identity during updates. Deferred sound/editing/subtitle comments survive visual revisions and remain withdrawable until applied. The API and browser rehearsal share the same production-view projection, with authorization retained in the HTTP route.

A browser regression uses the real Next pages, production controller, budget reservations, local montage and exports, with an isolated disposable database/wallet and injected director/provider responses. External fetches are denied. It exercises start, storyboard feedback, storyboard approval, video budget, whole-film visual review, deferred sound feedback across reload, local finishing, exact-version approval, explicit saving and downloads. Never run it against a client production or use real provider credentials. Command: `pnpm test:client-journey`.

This rehearsal exposed a local audio-check failure when music is disabled: AAC tails dropped from below -73 dBFS to digital silence and were misclassified as abrupt audible edits. The detector now excludes steps whose two windows are both at or below -60 dBFS; audible drops/attacks, source consistency, fades, loudness and peak checks remain enforced. A dedicated regression covers both inaudible tails and audible cuts. Real client test 477ccc3f-bb61-4c9b-9164-f945972660bd remains untouched.

Final verification: 429 tests across 59 files pass, TypeScript and targeted ESLint pass. The complete browser journey passed on 2026-10-18 through all five stages, local sound revision, final approval, explicit save and three format exports. Storyboard images and preview/final video metadata loaded in the actual browser. Proof: `storage/qa/client-journey-proof.json`. Zero external fetches and zero paid calls. All 117 original test checkpoint hashes match the pre-work baseline. The local connected app responds on port 3108. These checks establish the tested workflow with injected media, not live provider availability, unrestricted feedback interpretation or human artistic acceptance.

## Storyboard feedback and narration segmentation, 2026-10-18

The test e97b3a90-9742-4f8a-b857-0118d1c87702 exposed a mechanical 28-word cutoff: the Qatar/Israel comparison ended with a separate "Israel." panel. The first attempted repair persisted sentence-preserving sceneNarrations and balanced longer chunks. Shimi rejected that approach: it still predetermined the editorial boundaries. It is superseded by the semantic initial planning described below. Existing productions without this field keep their original segmentation and request identities. All production consumers and repairs use the persisted partition. The runtime director rules and prompt explicitly explain comparisons and permit physical clay flags in the set for named subjects; this is instruction, not proof of artistic quality.

The shared form is labeled Feedback on the storyboard and appears above the scene cards. It supports explicit scene selection or scene numbers in the comment, preserves individual notes, prices only affected image revisions and invalidates a price if scope changes. A requested structural merge of an already generated storyboard is still unsupported and must be stated as such, never billed as a redraw; starting a new test uses the corrected partition. This limitation must not be reported as a completed merge feature.

Verification: regression of the exact comparison, legacy partition preservation, runtime memory injection, scoped pricing/input preservation, stale-scope rejection and component interactions are covered offline. The isolated browser rehearsal exercises a shared local correction followed by the full client journey; no paid generation is permitted in that rehearsal. Current client test files were not edited and its production was not relaunched.

Verification completed on 2026-10-18 for this change: 438 tests passed in the full suite; subsequent focused checks passed after the physical-prop prompt adjustment and mixed-range scope parsing. TypeScript and targeted lint passed. The real Next.js interface / real controller browser rehearsal reached downloads and exports after applying a shared correction to scene 1 only, preserving scene 2 and the individual comment. `storage/qa/client-journey-proof.json` records zero external calls and zero paid generations. This checks interaction and orchestration with fixture media, not the artistic result of a newly generated comparison.

## Semantic initial planning, 2026-10-18

Shimi's correction: repair the initial understanding and breakdown; merging already-generated panels is not the requested solution. New connected Starts send the WHOLE script to one director request for both semantic boundaries and visual compositions. No provisional scene list or fixed count is passed. Each beat returns exact narration, idea, boundaryReason and continuityKey; these are saved in editorialPlan (semantic-ideas-v1) and sceneNarrations. The same saved partition feeds every downstream stage. Structural guards reject omitted/rewritten text, obvious dangling comparisons and clips too long for animation before images. They cannot certify artistic relevance. There is no automatic paid retry or word-count fallback.

Sentence-level preflight only estimates the spending allowance. Receipt v3 allows different semantic boundaries and start/end positions within its total image and money caps. If the analyzed plan exceeds that allowance, the plan is saved and the client sees its actual image price before any image submission, without paying for another analysis. Already accepted legacy receipts and paid partitions remain unchanged. Future Starts still use the configured paid analysis service; this implementation work uses only injected responses and local tests.

The semantic browser rehearsal (local injected speech/media) exposed a separate finishing defect when music was turned off: mono source calibration predicted -14.8 LUFS, but duplicated stereo playback measured -11.9 LUFS. Reference loudness now measures the renderer's dual-mono layout; peak measurement and the final audio acceptance limits remain unchanged. A local FFmpeg regression checks both channel layouts and an encoded stereo output. Client media and original narration are not rewritten by this code change.

Validation on 2026-10-18: 453 tests passed across 62 files; TypeScript and targeted lint passed. After fixing stereo calibration, the isolated real UI/controller journey passed from Start through the semantic two-scene plan (three provisional sentences), scene/global comments, storyboard approval, video budget, complete-film visual review, separate finishing changes, final approval, explicit save and three format downloads. storage/qa/client-journey-proof.json records zero external calls and zero paid generations. Model outputs and media were injected fixtures: this proves the wiring and gates, not the artistic merit of a newly generated storyboard. Existing client tests were not modified or regenerated.

## Preparation truncation and simplified creation screen, 2026-10-18

The client Start at 08:17:15 UTC failed before any production job/image submission. Read-only provider metadata confirms finish_reason=length / native max_tokens: the old semantic allowance was 5,730 total output tokens, including 2,648 reasoning tokens, so the structured storyboard was cut off. The exact billed analysis was $0.069814. Its existing assistant request 731cfcc1-d36b-561c-a437-5e61e1e2ef11 now carries that verified failure receipt and accounting entry, instead of losing the receipt under an undifferentiated uncertain outcome. No completion text was recoverable; logging was not enabled and was not changed. No new generation was sent.

New semantic planning requests allow up to 16,000 output tokens for reasoning plus the full plan, fitting the allowance to current prices/context with a 10,000-token minimum and the unchanged $0.25 ceiling. If the minimum cannot fit, stop before inference. Deep requests above 8,000 tokens have a four-minute response timeout. Read-only current-price checks with the actual director prompt show maximum bounds of $0.200498 for an 865-character script and $0.210768 at the 6,000-character input limit. These are bounds, not actual future charges or a guarantee against all provider failures.

Received truncated or invalid structured answers retain whitelisted receipt metadata (identifier, cost, token counts, model and failure type), without saving partial content or reasoning. They remain non-replayable; repeated identical submissions reproduce the known failure without a new call. Network failures remain uncertain. Client errors explain the interrupted plan without exposing model names. There is no automatic retry or substitution of a mechanical scene breakdown.

Shimi requests removing Manual mode and the Have an idea? assistant for now. The creation screen now contains title, script, format, the disclosed allowance and Start. New films use automatic direction; saved jobs and the offline existing-film example retain their internal compatibility. Support guidance and AGENTS.md match. No navigation or production-launch click was made in the user's CAM tab.

Verification: 464 tests across 64 files pass, including provider-envelope truncation with its receipt, invalid JSON/schema output, cost/context bounds, known-failure replay protection and ledger deduplication. TypeScript, targeted ESLint and diff whitespace checks pass. The complete isolated browser journey passes from the simplified automatic Start through storyboard comments/approval, video budget, whole-film visual approval, separate finishing revision/approval, explicit save and all three exports. It asserts no Manual/Have an idea?/quality-tier controls on creation and an automatic Start payload. Proof: storage/qa/client-journey-proof.json, zero external calls and zero paid generations. These tests use injected media and do not establish live artistic quality. The client app was not restarted and its production was not relaunched.

## Code-only typographic motion integration, 2026-10-18

Shimi authorized a separate motion-design category with autonomous implementation
and no paid test generation. The governing brief is
`CODEX-BRIEF-2026-10-18-motion.md`; `motion/METHOD-fr.md` is authoritative.
`motion/PLAN.md` records the five implementation decisions and
`motion/ACCEPTANCE-fr.md` records evidence and limits. This is executable prompt,
code and state-machine integration, not model-weight fine-tuning.

The client enters through `/motion/new`: script and $10 accepted price, then
`/motion/[id]` shows an animated scene board with movement/meaning, individual
Yes/No votes and scene/global feedback, complete-film visual review, separate
finishing, exact-file final approval and download. Saving to My videos is explicit.
Corrections cost $5 after price approval, up to $20 total. Only targeted scene
source blocks may change; other blocks and the shared footer remain byte-identical.
The finishing controls adjust music level and subtitle visibility locally. They
are not an unrestricted natural-language montage editor.

The configured Claude writer receives the complete method, worked builder and
measured voice timings, and writes full scene code. The voice path uses ElevenLabs
Dylan via Higgsfield, followed by local Whisper alignment and paced breathing.
Supplier receipts and customer pricing stay separate: unknown actual voice USD
is null; quoted voice credits are not invented dollar invoices. Writing and voice
operations are journaled before submission, accepted IDs are reused, uncertain
outcomes cannot be automatically billed again. Initial/revision prices reserve
wallet funds; exact final approval settles the cumulative price once.

Generated Python, Chromium inspection and HyperFrames 0.8.91 rendering run under
macOS Seatbelt, without inherited credentials or external network access. Python
cannot spawn subprocesses. AST and restricted HTML checks supplement the OS
boundary. Unsupported platforms fail closed; deploying Linux still requires an
equivalent isolated worker. Media is served only through owned, revision-bound
MP4/JPG routes. Existing client jobs and accepted clay contracts were not migrated.

The immutable original template has three safe-area overflows in scenes C and G.
Shimi explicitly answered “Oui, corriger les cadrages” on 2026-10-18. The original
is retained; `motion/reference/plot-hole-v4-safe.py` changes only two text-fitting
widths and is the writer's corrected worked example. Its golden HTML SHA-256 is
`4a5a204661f2c11b10162e0aa5ac031d0345be696eca6b0855acaf088843b595`.
Original hash remains `661c98e3234a622a1b28d0a8a3e453c6133ba73ac8c17b3861869d0e17bcb592`.
The corrected reference must pass all checks; the original is deliberately
rejected by the safe-area check. This framing authorization does not approve all
future model-generated films or waive human visual review.

A real render exposed a font substitution missed by HTML-only checks: HyperFrames
bundles fonts as data URLs, which the initial CSP blocked. Font-only data URLs are
now allowed; script data URLs and external connections remain blocked. One stable
encoded frame per scene must match the independently inspected composition at
SSIM >= 0.96. A negative check rejects the previous serif-font MP4 (SSIM 0.911).
Finishing refreshes inspection frames before comparing its encoded output.
Other measured gates: registered transition holds, per-phrase offset below 0.3 s,
reading zones, declared removed words, visible CAM ending, SFX >=15 dB below voice,
and mix near -17 LUFS. These measurements do not certify semantic/artistic merit.

Two integration defects caught offline were fixed: PostgreSQL JSONB key ordering
must not falsely invalidate untouched scene descriptions, and a browser test must
wait for the finishing update before approving the new file. The current local
runtime passes its read-only preflight. No paid request was sent, no provider
credit was purchased, and the user's running test/server was not restarted.

Final verification on 2026-10-18: 473 unit tests across 66 files, full ESLint and
TypeScript pass. Both real-browser journeys pass: existing clay through three
exports, and motion through the authorized corrected reference, actual scene-2
revision, whole-film approval, deferred sound note, changed finishing settings,
exact-file final approval, download and explicit save. The motion output is
1080x1920, 30 fps, 46.2 seconds with audio. Both journeys report zero external calls
and zero paid calls. Supplier responses are injected; rendering and database/UI
flows are real. Evidence: `storage/qa/motion-verification/summary.json` and the
copied journey proofs/logs, plus the latest motion evidence directory referenced
there. Corrected baseline preview: `storage/qa/motion-safe-reference/preview.mp4`.
Local runtime preflight passed. Do not describe this as final artistic acceptance
or proven live supplier quality: Shimi still needs to review the film and a paid
provider test was explicitly excluded. The macOS-only worker remains a deployment
limitation for a future Linux server.

## 2026-10-18 — Start bloqué après le découpage sémantique : bâtiments et fiche du monstre

- Essai conservé : `b54b49d6-219c-4e9d-af5b-3f60f986e5ba`. L'analyse avait produit neuf scènes, mais aucun devis ni aucune requête média n'avait été enregistré. Le message générique provenait de l'initialisation du storyboard, après sauvegarde du plan.
- Reproduction locale avec les données enregistrées : `building models` déclenchait à tort le détecteur de construction (`build\w*`). Les scènes 1 et 2 sélectionnaient aussi `monster`, dont le catalogue ne contient toujours aucune fiche approuvée. Ne pas transformer un portrait en fiche approuvée par simple changement de statut.
- Correction : reconnaître les maquettes de bâtiments comme des objets existants tout en conservant le contrôle des véritables constructions. Pour les plans `semantic-ideas-v1`, une référence de catalogue sans fiche devient une opération de préparation interne, comptée dans le budget images. Une seule fiche par identité/hash, résultat exact utilisé comme dépendance de chaque image concernée et montré dans la planche. La validation humaine du storyboard porte aussi sur ces fichiers. Le catalogue ne reçoit aucune approbation automatique. Les graphes historiques et les fiches approuvées dont le hash ne correspond plus restent protégés.
- La fiche supplémentaire respecte les plafonds signés du lancement (nombre d'images, coût fournisseur, prix client). Si elle les dépasse, le devis corrigé reste à accepter avant tout appel média.
- Vérification : 480 tests unitaires réussis, TypeScript et lint réussis. `scripts/check-saved-storyboard-start.ts <jobId>` rejoue la transition devis/validation dans un schéma jetable avec les paramètres exacts, tarifs simulés et réseau interdit. Preuve : `storage/qa/saved-storyboard-start-proof.json`, neuf images + une fiche, aucune requête externe, aucune génération payante, aucun worker lancé, essai source inchangé, reprise sans double réservation.
- Cette preuve établit la correction du blocage et les dépendances de référence. Elle ne valide pas la qualité esthétique des futures images ; celle-ci reste soumise au storyboard humain.
- Parcours navigateur complet également réussi après correction : `pnpm test:client-journey`, preuve `storage/qa/client-journey-proof.json` du 2026-10-18, jusqu'au téléchargement et aux trois formats, fournisseurs simulés, zéro appel externe. Serveur client 3108 laissé en place ; aucune navigation ou relance du test réel.

## 2026-10-18 — Second blocage Start

Diagnostic, décisions et preuves conservés intégralement dans `docs/memory-start-diagnostics-2026-10-18.md`.

## 2026-10-18 — Retours storyboard verrouillés puis appliqués ensemble

- Nouvelle règle de Shimi : chaque retour de case et le retour global se verrouillent séparément, sans lancer leur application. Un bouton central lance le lot. L’interface conserve les brouillons voisins pendant les sauvegardes et le polling. Les changements locaux sont appliqués au lancement du lot ; les nouvelles images restent soumises au prix supplémentaire et à son approbation explicite.
- Le serveur enregistre les notes verrouillées sans devis, modification d’image ni worker. Le devis de lot lie les textes exacts, les scènes visées, les versions d’images et les éventuelles fiches de personnages. Modifier ou retirer un retour annule l’ancien devis et remet les autres notes du lot en état verrouillé. Aucune note de la scène 8 ne doit être envoyée comme note de la scène 2.
- Diagnostic sur Test 04 (`59f74d40-26e7-438a-a407-181c95b3523d`) : les deux commentaires existaient toujours. Le retour de la scène 2 était marqué regenerating ; une lecture seule de son résultat fournisseur a confirmé HTTP 422 / content_policy_violation. Le résultat brut n’était pas enregistré comme échec définitif et la sortie de l’état storyboard masquait tous les formulaires. La scène 8 était déjà marquée applied par le précédent traitement ; cela ne prouve pas la satisfaction artistique du retour.
- Correction : les refus définitifs de résultat sont enregistrables comme échecs et ne sont pas renvoyés automatiquement. Chaque révision d’image possède son résultat indépendant. En cas d’échec, conserver l’ancien panneau complet, continuer les autres révisions autorisées et revenir à une planche avec l’erreur locale. Ne jamais approuver automatiquement une planche partielle ou cacher ses retours. Les blocages budgétaires et les pertes de verrou restent bloquants.
- Vérification : 494 tests sur 68 fichiers, TypeScript et lint ciblé réussis. Les régressions couvrent verrouillage sans effet, portée du lot, maintien des textes, invalidation du prix, retrait d’un retour sans perdre les autres, refus d’une scène avec réussite de l’autre et absence de nouvelle soumission lors de la reprise du refus.
- Parcours navigateur complet réussi jusqu’à la finition, sauvegarde explicite et trois téléchargements : `storage/qa/client-journey-proof.json`, incluant storyboard-lock, storyboard-global-lock et storyboard-batch-apply. Base/port isolés, fournisseurs injectés, zéro appel externe et zéro génération payante dans cette vérification. La page réelle a été rechargée uniquement pour vérifier les nouveaux formulaires et les textes sauvegardés des scènes 2 et 8. Aucun retour réel n’a été appliqué, aucune image réelle régénérée et aucun budget réel approuvé pendant cette réparation.
- Limite : cette réparation valide le parcours et la résistance aux erreurs, pas l’interprétation universelle des commentaires ni la qualité des images. La scène 2 reste à corriger/reformuler par l’utilisateur avant une nouvelle demande payante ; ne pas annoncer son image comme réparée.

## 2026-10-18 — Marge dégressive et devis de Test 05

- Shimi remplace la marge systématique ×2 par une marge adaptative, avec ces repères : coût fournisseur 20 $ → prix client 35 $ ; coût 30 $ → prix 40 $. Objectif de prix courant autour de 30–40 $, sans gonfler la facture sur les productions plus chères.
- Politique configurée `adaptive-v1`, partagée par l’annonce du coût de préparation et le devis client cumulatif : jusqu’à 15 $ de coût, ×2 ; entre 15 et 20 $, coût +15 ; entre 20 et 30 $, 25 + moitié du coût ; entre 30 et 35 $, 40 ; au-delà de 35 $, coût +5. Arrondir ensuite au dollar supérieur. Ce dernier cas est une exception explicite à l’objectif de 40 $, jamais une vente à perte masquée. La marge est brute, avant frais de paiement, structure et incidents non budgétés.
- Test 05 `25c5641f-b583-491f-937b-818b91943f5c` : estimation fournisseur totale 27,485 $, composée de 1,95 $ images, 0,135 $ voix, 1 $ maximum de synchronisation et 24,40 $ animation/finition. L’ancienne règle produisait 55 $. Nouveau total client 39 $, préparation incluse ; marge brute théorique 11,515 $. Ce n’est pas une facture fournisseur réconciliée ni une preuve de bénéfice net.
- Seul le devis client non approuvé de ce test a été remplacé, sous verrou portefeuille avec nouvel identifiant. La réservation de préparation de 4 $ reste inchangée et sera remplacée, pas ajoutée, lors de l’approbation du prix complet. Les devis déjà approuvés restent immuables. Historique de changement dans le réglage `customer_pricing_adaptive_20261018` ; preuve `storage/qa/adaptive-pricing-proof.json`.
- Vérification : 514 tests réussis, TypeScript et lint ciblé réussis. Tests des paliers, continuité/non-décroissance, arrondi, coût nul, absence de vente à perte, prix cumulatif, anciennes offres conservées et même politique dans la préparation. La page réelle affiche 39 $ sans rechargement ni clic d’approbation. Aucun appel média, aucune génération payante, aucun changement des images ou du plan.

- Après cette vérification, le client a poursuivi son test depuis l’interface : étape Video visuals visible et réservation totale de 39 $ constatée en lecture seule. Aucun clic de lancement n’a été effectué par l’agent. Capture de cet état : `storage/qa/adaptive-production-state.png`.

## 2026-10-18 — Fiabilisation intégrée après arrêt du test

- Shimi a arrêté son test et demandé l’intégration autonome, sans génération payante. Le navigateur ne pilote plus la progression de la production Clay connectée. Les actions autorisées enregistrent une intention durable dans le checkpoint avant la réponse HTTP ; un processus indépendant avance ensuite sous verrou PostgreSQL. Le serveur web et ce processus sont supervisés séparément par les lanceurs local et production.
- Fermer le navigateur n’arrête plus ce traitement. Après arrêt brutal du processus, les identifiants acceptés et les fichiers terminés sont repris. Les bornes des tentatives de lecture restent persistantes. Une soumission dont l’identifiant est inconnu reste bloquée pour rapprochement, afin d’éviter une double facturation. Les validations storyboard, budget, film entier et finition restent inchangées.
- Les révisions d’images en attente poursuivent leur lecture tout en conservant les anciens panneaux. Les téléchargements connectés reprennent les exports locaux interrompus et réutilisent les formats vérifiés. Les productions historiques sans intention explicite ne démarrent pas lors de l’installation ; Test 05 reste en pause.
- Preuves : 536 tests sur 74 fichiers ; arrêt brutal réel du processus de test après acceptation, concurrence de deux processus, reprise du même identifiant, soumission incertaine non répétée (`storage/qa/worker-restart-proof.json`). Parcours navigateur/controller jusqu’au téléchargement avec fermeture de Chrome et arrêt/redémarrage du serveur web, fournisseurs simulés, base jetable, zéro appel externe (`storage/qa/client-journey-proof.json`). Voir `docs/reliability-plan.md` pour le périmètre et les preuves d’activation.
- Limites : conserver la base et le dossier storage ; une machine arrêtée ne calcule rien et reprend quand les services reviennent. Aucune promesse d’absence totale de panne fournisseur. L’analyse initiale payante et le moteur motion séparé ne sont pas rejoués automatiquement. Aucun nouveau film réel n’a été généré pour ces vérifications et la qualité visuelle reste à valider par Shimi.

- Activation locale vérifiée : arrêt brutal du serveur web puis du worker, redémarrages indépendants effectifs, connexion HTTP 200. Les 17 fichiers de suivi de Test 05 gardent leurs empreintes SHA-256 initiales. Aucun test réel repris. Preuve : `storage/qa/reliability-2026-10-18/activation-proof.json`.

## Earlier Test 05 replacement diagnosis

Full dated diagnosis and proof references are preserved in docs/feedback-repair-history-2026-10-18.md.

## 2026-10-18 — Scene 7 failure, test 8bf03e02

Read-only Higgsfield lookup of request 928bfa00-fb54-4353-9f36-c7c7c94753a9 confirms failed / seedance_2_5, with misleading type=image and no reason. This is a definitive external failure, not proof of content rejection or refund. Scene 7 is the sole blocked scene. No automatic retry was made.

The saved-replacement rehearsal now derives failed scene IDs from the actual snapshot instead of hardcoding scenes 1 and 2. Against this test it passes price preparation, offer refresh and exact approval in a disposable schema, with 61 original JSON files unchanged, zero external calls and no worker. Evidence: storage/qa/saved-replacement-proof.json. A read-only real price lookup then prepared only the pending replacement offer: native Kling for scene 7, total customer price $18 (not an $18 supplement). Original approval and all 19 request receipts remain unchanged. No generation or price approval was performed. Evidence: storage/qa/cam-draft-fallback-proof.json. Live success of the replacement remains unverified and requires the user's approval. Comics remains isolated under /tmp/cam-comics-20261018, not integrated.

## 2026-10-18 — Quiet audio ending, complete preview recovered

After the user approved the replacement, scene 7 completed successfully. The next failure was local audio pacing: Whisper's final word ends at 54.94 s in a 54.96 s recording, triggering the 20 ms fade boundary. Measured final 20 ms: -63.56 dB. The original recording is not rewritten. `paceRecording` now adds 200 ms of silence only to the derived track when the boundary is already quiet; energetic endings and out-of-file timing still stop for review. Original samples and word timestamps are preserved in the boundary regression cases.

The saved production 8bf03e02 was resumed with provider transports and fetch denied. Complete 58.53 s preview rendered successfully; production error is null and state is awaiting-review / draft-film. All 37 original source/receipt files, the approved quote and approval remained unchanged. Zero external calls, zero paid generation, zero denied transport attempts. Evidence: storage/qa/saved-quiet-tail-preview-proof.json. Local audio controls pass (-14.1 LUFS, -3.3 dBTP); visual and listening approval remain Shimi's responsibility. The film has not been approved by the agent.

Validation: 556 tests across 75 files, connected TypeScript and targeted ESLint pass; regression covers the exact 20 ms boundary. Comics remains isolated and is not integrated into the live test.

The production worker was gracefully reloaded after the complete preview reached its human-review gate; the web server stayed running. New worker verified, saved state still awaiting-review with no error.

## 2026-10-18 — Video feedback batches and deferred finishing

Shimi requires the storyboard interaction for the complete video: lock each note, then one Apply all changes. Locking performs no inference or generation. The visual controller sends the whole selected batch to Claude once, accumulates operations and prepares one offer; each original note and timestamp is bound to that offer. Editing/withdrawing a quoted note invalidates its unapproved price. Finishing uses one combined settings update/render intent. Contradictory local edits require clarification rather than silently overwriting another note.

Ending-transition feedback belongs to finishing, even when it cannot yet be executed there. An unsupported finishing request must not block visual corrections or visual approval. Timed notes in the closing sequence reach the director with an empty scene scope. Keep for finishing is an explicit no-inference routing action that preserves the note. Deferred notes survive visual revisions/approval and remain pending until handled in finishing.

The previous director rejected requests for more motion outright. Visual-film edit.motion now expresses a self-contained priced animation revision within the approved duration, with unchanged still images and narration. Only its clip retry increases; image changes remain separately priced when requested. The changed storyboard motion still requires human approval before animation. Script re-cuts, narration and duration changes remain unsupported and explicit. The director prompt/cache contract is v2; old paid requests and already-rendered films are preserved.

Actual saved-case follow-up: scene 3 lacked a model because it was local; an untimed duplicate also wrongly expanded to nine scenes. Exact repeats now retain the unique timed scope. Only explicitly corrected new clips may select a first model; old models/prices stay locked. Offline replay adds only scene-3-clip and scene-5-clip-retry-1, preserves 3 notes and 79 source files, and reuses the quote on double click. Proof: storage/qa/current-film-feedback-proof.json. Batch/deferred-finishing evidence and limits: docs/film-feedback-batch.md. No paid calls or live corrections.

## 2026-10-19 — Agent persistant et Attack

Architecture : une session Claude par vidéo, skills CAM autorisés et mémoire partagée approuvée dans `/admin/memory`. Aucun accès au second cerveau privé. Attack est intégré sous `/comics` avec retours groupés, prix avant média, contrôles bloquants et finitions séparées. Preuves et limites : `comics/ACCEPTANCE-fr.md`, `docs/agent-architecture-plan.md`. 606 tests et 3 parcours réussis sans dépense ; migrations locales appliquées. Validation artistique de Shimi encore nécessaire.

2026-10-19: Shared Claude recovery for Clay/Motion/Attack; exact rejection + rejected source must survive every stop. MD02 exposed missing evidence despite mocked tests. Exact duplicate prelude helpers are discarded; changed helpers stay guarded. Client messages separate from diagnostics. Explicit re-analysis preserves receipts/attempts. No paid retry here. Proofs: docs/pipeline-supervision-2026-10-19.md; docs/motion-md02-2026-10-19.md.
