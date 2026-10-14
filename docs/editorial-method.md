# CAM Clay editorial method

Integrated on 2026-10-14 from the October 5 production sources and Shimi's Claude handoff. Rendering a valid MP4 is not editorial acceptance.

## Before paid generation

Claude supplies a physical metaphor, initial scene, physical gestures, selected characters, action duration, inter-phrase breath, and a distinct final scene for every state change. The scene editor exposes those choices. Image prompts contain only the selected characters, preserve the locked clothing, prohibit generated lettering/logos and specify a full-frame miniature set. All typography and CAM branding are composited locally.

`physical-direction.ts` detects common changes of state, missing/identical endpoints and an already-open scroll. This is conservative text validation, not visual understanding. Actual endpoint images still require review. Materialization refuses a state-changing video without its end image. The live chain rejects invalid directions before submitting a voice or image request. Explicit action durations govern animation requests, with a four-second minimum for state changes. Old plans without action durations keep their measured interval fallback.

## Local finishing

`editorial-audio.ts` preserves the source WAV and creates separate paced and mixed tracks. Pauses are extended only by the missing duration, using the quietest measured point between aligned words, below -42 dB. Joins fade over 15 ms; every timestamp moves by the exact inserted samples. No word-length interpolation or new transcription. An unsafe gap or missing post-word tail blocks finishing.

The final voice fade is placed after the last aligned word. The last measured activity plus 0.8 seconds controls the logo, not an overlap before the file ends. Energetic source tails are explicitly marked for human listening: fading does not reconstruct missing phonemes.

The original local score follows the October marimba/pluck approach, with a quiet pad across pauses, a restrained low logo impact, 400 ms attack and at least 1.2 seconds of release. It is a separate track, carved out of the speech band and ducked against the actual recording, with a slow release; this FFmpeg processing is saved to an asset, so preview and export use identical audio. Music is set 20 dB below voice energy during aligned words. A derived R128-normalized voice track controls isolated peaks while retaining the original and paced WAVs.

`stageSceneMedia` supports reviewed source in/out points, crop and playback rate. Actor performance stays within 0.8–1.25×; complete transformations may use 0.5–2× and are rejected if the selected action cannot fit. Similar aspect ratios fill the canvas; genuinely different frames are fitted instead of arbitrarily cropping faces. The same choices, timing, tracks and logo variant persist in export cues.

## Review gates

The final decoded AAC is measured, not just the timeline: integrated loudness -14 ±2 LUFS, true peak at most -1 dBTP, no unexplained step above 20 dB between 10 ms windows, no digital silence longer than 100 ms before the final 300 ms, and final 100 ms below -60 dB. Failure stops publication of the new render. Reports, full/end waveforms and a transition-listening reel accompany the result.

Four-frame-per-second contact sheets are saved in four-second pages, plus caption and cut boards. A person must still assess motion physics, identity, facial action and word completeness. The code never marks those as automatically approved.

## Bram test revision

Free finishing command: `pnpm exec tsx --env-file-if-exists=.env scripts/finish-bram-test.ts`. It locks the job, forbids fetch, renders two signatures, verifies the unchanged original voice and provider journal, archives the previous montage and publishes a review preview. It does not generate a repaired scroll. Source: `storage/concepts/2b0df353-688e-4d7c-b5aa-6a31cd4b2f21/live/state.json`; revisions: `live/finishing/claude-method-v3/`.

The 11.9-second previews retain the current three clips. Scene 1 is held before its blink/reframe, scene 2 skips its initial blink but remains physically wrong, and scene 3 is cropped and held before the ring turns away. These are interim editing choices, not a claim to restore the reference films' visual quality.

`sceneRepairPlan` creates a separate proposal with the unchanged recording and unaffected scenes; it cannot inherit the old budget approval. The current scroll proposal uses two 2K images and one 5-second animation. `quote-bram-scroll-repair.ts` derives a quote from the authenticated fal pricing response saved in `storage/qa/cam-bram-repair-prices.json`: $0.15 + $0.15 + $0.70 = $1.00. The quote expires, has no approval, and does not permit automatic retries. Refresh prices before execution. No new voice, Whisper or OpenRouter call is part of this repair.
