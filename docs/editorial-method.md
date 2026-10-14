# CAM Clay editorial method

Integrated on 2026-10-14 from the October 5 production sources and Shimi's Claude handoff. Rendering a valid MP4 is not editorial acceptance.

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
