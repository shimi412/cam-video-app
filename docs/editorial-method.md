# CAM Clay editorial method

Integrated on 2026-10-14 from the October 5 production sources and Shimi's Claude handoff. Rendering a valid MP4 is not editorial acceptance.

## Current corrections, 2026-10-15

The current operational contract is the marked section of root `MEMORY.md`, read afresh by the director for each new preparation. The chronological records below describe earlier states where noted. Current production prepares the image storyboard before narration and animation; the initial preparation amount is disclosed on Start, the video quote follows human storyboard approval.

One starting image is planned per scene. A final image is included only for an actual planned change of state. New connected Starts give the director the entire script, without preassigned scenes or a fixed word count. The director chooses meaning boundaries and compositions together, records each beat’s idea, cut reason and continuity, and preserves the original narration exactly. The signed provisional allowance caps images and money, not the editorial partition. If the actual semantic plan exceeds it, the analyzed plan is saved and its real image price requires approval before generation. Existing paid plans keep their original partitions and manifests. Directions choose meaningful settings, objects/actions, camera scale and light for each passage. A presenter and a small hand gesture repeated across the whole script is a detected planning fault, not the intended CAM treatment. The approved sheets fix character identity, not pose or setting.

Each storyboard case now supports persisted comments. Supported local title/symbol corrections appear in the composed preview and the same montage. Framing, setting and lighting changes can be quoted and regenerated for the selected scene, preserving unaffected images. A changed comment invalidates its previous revision proposal. New characters require approved sheets; new physical actions or timing changes require a revised action plan and cannot silently pass through an image-only correction. Any changed composition requires human review again.

Images preserve their original source bytes. Aspect-ratio and conservative padded-band checks can warn on an affected case; they do not certify narrative meaning or artistic quality. No automatic paid retry follows a warning. The interrupted test's first image already contained the visible bands before import. Same-operation legacy image requests whose fingerprints change are blocked before resubmission; only an explicit quoted revision has a new attempt identifier.

These changes are checked with local unit tests, real controller logic using injected provider fixtures, and a temporary UI fixture. No new generated image or real supplier video was produced during this repair, so live visual quality remains for the next human test.

## Character sheets: required correction, 2026-10-14

Shimi requires genuine multi-view character sheets, visible on hover and click in Library and actually supplied to scene generation. Enlarging a single portrait does not satisfy this requirement.

Historical gap on 2026-10-14: the three pinned character PNGs were single-view references. This was subsequently corrected for narrator and effigy; see the current registry and “Required character sheets and video library” below. Monster remains pending. Do not infer approval from a portrait or a file's presence alone.

Required workflow: preserve each approved canonical character; prepare a consistent multi-view sheet on flat neutral grey; have a human review identity, proportions, clothing and material across views; register the approved file and its content hash; use that same approved sheet as the character reference in scene generation and in Library. A changed sheet must invalidate dependent generation plans and storyboard approval. Only characters present in a scene should be attached. Keep historical assets for existing productions. Show a cost estimate before generating new sheets; do not automatically regenerate existing films.

## Human storyboard approval before animation

User correction, 2026-10-14: physical plausibility is not narrative meaning. The V4 cupboard/dove reveal was rejected because it did not explain how context changes interpretation.

The production chain now prepares **all scenes’ keyframes first**. Individual direction/start/end checks remain, followed by one complete storyboard containing the narration, intended meaning, action, and actual start/end images of every scene. Imported existing media is explicitly labelled as reused. No new animation can be submitted until the whole storyboard has a matching human decision.

CAM displays the sheet above the film with a dedicated checkbox and **Approve storyboard & animate** action. Budget approval never supplies that decision. The authenticated controller requires `storyboardConfirmed: true`, stores the actor/time/note separately, and verifies that evidence when the worker resumes. A refusal requires feedback, stops the chain and preserves prior files; prepare a revised version from the conversation. Changes to pictures, wording, order, motion, voice context or parent reviews invalidate the target. Existing animations from a different target are blocked from duplicate submission and require deliberate reuse in a new version.

The original V4 keyframes are shown retrospectively with Shimi’s scene-3 rejection. They are never represented as prior human approval. The repair and finishing operator scripts also require a current human-approved storyboard. Their old technical reviews alone cannot authorize continuation. New direction requests must explain the inference supported by the picture and avoid arbitrary symbolic reveals. This prompt guidance is not an automatic semantic quality guarantee.

Verified with 160 unit tests, TypeScript/lint/build, the offline production/recovery check, and the injected connected controller/export check. Proofs `storage/qa/cam-production-flow-proof.json` and `cam-connected-controller-proof.json` include the whole-board pause, refusal without spend, explicit controller confirmation, and recovery after approval. No external generation is part of these checks.

## Before paid generation

### Optional metaphors and presenter typography

User correction, 2026-10-14: not every sentence benefits from a metaphor. A distant analogy should give way to the recurring presenter with animated text above. The cupboard/dove, slogan swap and knife/cake directions are discarded for the Bram context sentence.

Each new AI direction selects `visualMode: metaphor | presenter-text`; historical packets remain compatible. The editor exposes the same choice. Presenter images reserve the upper 38% for locally composed exact narration excerpts; models never draw the lettering. The whole headline enters early, then its words gain emphasis at their supplied voice timestamps. Complete-sentence typography replaces duplicate captions. Finishing preserves these intentional text layers, and each export reflows them for its canvas. The storyboard shows the treatment and words; changing either invalidates approval. Human storyboard approval is still required before animation. No current film or raw voice is rewritten by selecting this option.

Claude chooses a clear visual action or the presenter with animated text, then supplies the initial scene, physical gestures, selected characters, action duration, inter-phrase breath, and a distinct final scene for every state change. The scene editor exposes those choices. Image prompts contain only the selected characters, preserve the locked clothing, prohibit generated lettering/logos and specify a full-frame miniature set. All typography and CAM branding are composited locally.

`physical-direction.ts` detects common changes of state, missing/identical endpoints and an already-open scroll. This is conservative text validation, not visual understanding. Actual endpoint images still require review. Materialization refuses a state-changing video without its end image. The live chain rejects invalid directions before submitting a voice or image request. Explicit action durations govern animation requests, with a four-second minimum for state changes. Old plans without action durations keep their measured interval fallback.

## Local finishing

`editorial-audio.ts` preserves the source WAV and creates separate paced and mixed tracks. Pauses are extended only by the missing duration, using the quietest measured point between aligned words, below -42 dB. Joins fade over 15 ms; every timestamp moves by the exact inserted samples. No word-length interpolation or new transcription. An unsafe gap or missing post-word tail blocks finishing.

The final voice fade is placed after the last aligned word. The last measured activity plus 0.8 seconds controls the logo, not an overlap before the file ends. Energetic source tails are explicitly marked for human listening: fading does not reconstruct missing phonemes.

The original local score follows the October marimba/pluck approach, with a quiet pad across pauses, a restrained low logo impact, 400 ms attack and at least 1.2 seconds of release. It is a separate track, carved out of the speech band and ducked against the actual recording, with a slow release; this FFmpeg processing is saved to an asset, so preview and export use identical audio. Music is set 20 dB below voice energy during aligned words. A derived R128-normalized voice track controls isolated peaks while retaining the original and paced WAVs.

`stageSceneMedia` supports reviewed source in/out points, crop and playback rate. Actor performance stays within 0.8–1.25×; complete transformations may use 0.5–2× and are rejected if the selected action cannot fit. Similar aspect ratios fill the canvas; genuinely different frames are fitted instead of arbitrarily cropping faces. The same choices, timing, tracks and logo variant persist in export cues. A reviewed minimum scene duration can extend a measured quiet gap so a gesture finishes naturally. That action hold is separate from the 0.25–0.8 second breath setting. Transformation fitting uses the visible interval before the logo, while the completed final frame remains underneath the signature.

## Review gates

The final decoded AAC is measured, not just the timeline: integrated loudness -14 ±2 LUFS, true peak at most -1 dBTP, no unexplained step above 20 dB between 10 ms windows, no digital silence longer than 100 ms before the final 300 ms, and final 100 ms below -60 dB. Failure stops publication of the new render. Reports, full/end waveforms and a transition-listening reel accompany the result.

Four-frame-per-second contact sheets are saved in four-second pages, plus caption and cut boards. A person must still assess motion physics, identity, facial action and word completeness. The code never marks those as automatically approved.

## Bram test revision: completed picture correction

Earlier free interim finishing command: `pnpm exec tsx --env-file-if-exists=.env scripts/finish-bram-test.ts`. It locks the job, forbids fetch, renders two signatures, verifies the unchanged original voice and provider journal, archives the previous montage and publishes a review preview. It does not generate a repaired scroll. Source: `storage/concepts/2b0df353-688e-4d7c-b5aa-6a31cd4b2f21/live/state.json`; revisions: `live/finishing/claude-method-v3/`.

The earlier 11.9-second previews retain the current three clips. Scene 1 is held before its blink/reframe, scene 2 skips its initial blink but remains physically wrong, and scene 3 is cropped and held before the ring turns away. These are interim editing choices, not a claim to restore the reference films' visual quality.

`sceneRepairPlan` creates a separate proposal with the unchanged recording and unaffected scenes; it cannot inherit the old budget approval. The initial scroll proposal used two 2K images and one 5-second animation. `quote-bram-scroll-repair.ts` derives a quote from the authenticated fal pricing response saved in `storage/qa/cam-bram-repair-prices.json`: $0.15 + $0.15 + $0.70 = $1.00. That initial proposal alone did not authorize a request; the subsequent session authorization below supersedes its unapproved state. Quotes expire and never permit automatic retries. Refresh prices before execution. No new voice, Whisper or OpenRouter call is part of this repair.


### Authorized repair session, 2026-10-14

Shimi authorized up to **$20 total in existing fal credits** for this correction, including the previously approved $1 scroll repair. The implementation reserves only the next reviewed operation, against both the session ceiling and the existing shared provider budget. It never buys credits or calls a new voice/alignment model.

`scripts/repair-bram-scene.ts` is an operator CLI for this exact authorized job. `prepare` fetches current prices; `advance` persists the budget phase and provider request before polling, and progresses one request only. `review` requires the exact downloaded hash and a written visual judgment. `amend` may adapt an unsubmitted end image to the inspected start geometry; `motion` may refine an unsubmitted animation after both endpoints are approved. Both keep history and all prior spend. There is no automatic retry after uncertain submissions. A rejected trial cannot spend further. The session lives in `live/repairs/bram-method-20261014/session.json`; CAM displays its reservations separately from the original production.

Final session reservation: **$3.30**, comprising eight 2K images ($1.20) and three five-second animations ($2.10). The first scroll pair was rejected for incompatible cylinder axes before animation. No duplicate submission, new Bram recording, Higgsfield call, OpenRouter call or paid transcription was made. These are authenticated-price reservations, not settled provider invoices.

Selected replacements: a fragment restored to its original book, a scroll unrolled away from the body with its free edge pinned, and cabinet shutters revealing a dove and olive branch. The locked narrator keeps his cap, striped shirt, trousers and suspenders. Endpoints were checked before animation, then complete motion at four frames per second; an enlarged eye sequence distinguished downward gaze from a blink. Reviewed source in/out points and speed are stored in `selection.json`.

`applyReviewedSceneRepairs` builds a new packet only from approved start/end/clip hashes matching the original source, voice and alignment. The original packet and eight provider receipts remain immutable. `scripts/finish-bram-repair.ts` renders locally with fetch forbidden, verifies those originals, and publishes both signatures under `live/finishing/claude-method-v4/`. It invalidates old format downloads so CAM rebuilds them from the revised cues.

The final preview is **14.133 seconds**: the added action holds preserve all spoken samples; the logo starts at 11.53 seconds. Both MP4s pass final AAC checks at **−14.2 LUFS / −1.2 dBTP**, with no unexplained level steps or premature digital silence. The original voice tail still requires human listening; no claim is made to reconstruct potentially missing phonemes. Contact sheets, waveforms, the listening reel, selection and provenance accompany the render. Friendly output: `storage/outputs/cam-bram-corrige-v4.mp4`.

## Cost and model preflight (2026-10-15)

Before a new paid production quote, apply the scene capability/current-price comparison described in `model-selection.md`. Preserve references, state-change endpoints, narration, local typography and human storyboard approval. The cheapest eligible connected engine is chosen under the requested source resolution; 720p is an explicit opt-in. The quote saves model choices; resumed runs cannot substitute a cheaper model. No blind sampling or automatic retries. The optional quoted draft-first path pauses for human review before completion. This comparison is rule-based and carries no invented visual-success percentage. New model families require adapter and CAM quality qualification before use.


## Public editing references reviewed 2026-10-15

Three Dan Kieft tutorials were read in full through their YouTube automatic transcripts: AgUATWAOaKY (editing), FJfMTvZvX7w (performance reference), 8gQ6qUmKjHg (animation). They are workflow demonstrations, including sponsored material, not comparative quality benchmarks. Exact community prompt packs were not obtained and were not copied into the product.

Implemented for new direction requests: a versioned CAM editorial policy prioritizes meaning, initial pose/action/final hold, expression, physical direction, setting/light continuity, ordered reference roles and local typography. Existing approved scene prompts and assets remain unchanged. Rendering emits `editorial-timeline.json` at 30 fps, from actual paced voice timings: shot/word/logo markers, actions, identity references and human inspection points. The administrator's decision-trail endpoint shows quote/model reasons, human review stage, request events and this timeline. It does not expose hidden LLM reasoning.

Not adopted automatically: always generating two takes; replacing the chosen narration using a video model; forcing multiple camera angles; applying camera Log LUTs to generated clay; regenerating the picture to obtain sound; merging many shots without checking billing and editability. Motion transfer, expression sheets, location images and new sound effects require the relevant assets, adapters, quote and human approvals. They are not implied by these textual rules. Reuse approved assets and repair a rejected shot in a new version before requesting an entire new film.

## Required character sheets and video library (2026-10-15)

Every character used in a new generated scene needs a human-approved multi-view sheet. `character-sheets.json` records the exact SHA-256, approval date and evidence. `lockedAssets()` verifies those bytes and supplies the approved sheet URL and file instead of the portrait. Narrator and effigy were approved on 2026-10-14 and integrated on 2026-10-15. Monster remains pending and blocks any new generation involving it; there is no automatic paid sheet generation.

The plan exposes a character-sheet blocker, quote requests refuse it before contacting providers, the controller refuses it before narration, and request materialization also refuses it. Missing, revoked or changed sheet evidence fails closed. All cast members' sheets bind to the start image and to the end image together with the approved start. Image-to-video engines receive those reviewed scene frames, which carry the character design; sheets are not inserted into unsupported video fields. Existing imported finished clips can still be viewed without being retrospectively described as sheet-based generations. Changed reference hashes invalidate dependent production approvals.

The Library groups characters by video and saved scene numbers instead of presenting a global equal-priority cast. Saved render storyboards take precedence over draft metadata. Hover/click displays the current approved sheet; older films are explicitly allowed to have used earlier references. No new use is inferred when a saved cast is missing. The monstre remains marked awaiting approval.

Verification covers exact local sheet hashes, all cast bindings, downstream video frames, pending/missing/changed sheets, no provider calls for blocked quotes, and per-video grouping. The isolated controller additionally checks that the exact approved narrator-sheet bytes reach its simulated upload adapter. No paid generation is performed.
