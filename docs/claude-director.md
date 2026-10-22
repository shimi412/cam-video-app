# Claude as CAM's creative director

Implemented 2026-10-18 following Shimi's request. Customer UI remains English and does not expose provider/model names. This document and the internal Whimsical explain the implementation.

## Responsibilities

| Stage | Decision maker | Execution |
| --- | --- | --- |
| Script and storyboard | Claude through OpenRouter, configured Claude deep model (default Sonnet 5) | Semantic beats, scenes, actions, exact narration, motion complexity. Code validates the plan and calculates necessary images. |
| Character sheets and images | Claude's initial direction or compiled feedback plan | Nano Banana Pro/edit through fal, approved references, native aspect ratio, priced media requests. |
| Storyboard feedback | Claude sees full script, saved images/local layers, this production's history and all locked notes | A typed plan changes local composition or prepares a priced image revision. No keyword fallback in the connected batch path. |
| Voice / timing | Approved voice configuration and script | ElevenLabs/Bram via Higgsfield for Clay; Whisper alignment, bounded local recovery. |
| Animation | Claude's declared simple/complex action, approved storyboard and budget | Compatible economical Kling route, complex Seedance route, or local typography. Adapter pricing and capability validation remain deterministic. Historical paid plans preserve their original routing. |
| Film feedback | Claude sees notes and context, storyboard references and sampled frames from the reviewed film | Local changes reopen composition review with no new media permission. Image changes receive compiled briefs and a new price before generation. |
| Sound, editing, subtitles | Claude interprets feedback against current finishing settings | Local rendering of supported settings; unsupported changes stay unresolved. Explicit settings controls execute their exact selected values. |
| Motion-in-code mode | Existing separate Claude writer reads METHOD-fr and writes/revises build code | Sandboxed HyperFrames/GSAP/FFmpeg; Dylan voice and local Whisper. No video model. |

## Boundaries and provenance

Client notes are editing instructions. They never become overlay text by default. Visible copy must be an exact narration excerpt or an explicitly quoted replacement. No automatic floating badges. A previous video's badge request does not enter another production's context.

Each semantic plan is saved under the production's director directory. Identical requests reuse it; the underlying AI request ledger also prevents uncertain requests being sent twice. Code checks exact scene scope, required notes, valid tools, immutable prices and human approvals. It does not choose an alternative creative interpretation if the director fails.

The director is not a license to spend or to skip human review. Claude analysis is recorded as included workspace assistant usage under the existing $0.25 request cap. Media generation still requires the displayed price approval. No new paid requests were made to verify this integration.

Actual image references are hash-verified. Film references are sampled stills, not continuous playback or audio analysis. There is no claim that arbitrary generated pixels or motion have passed an automatic artistic-quality gate. Visual-film motion revisions now produce a priced replacement clip using the approved stills and duration. Narration restructuring and duration changes still require clarification; they must never be misrepresented as an image redraw.

## Verification

553 tests across 75 files pass, with TypeScript and changed-file ESLint. The full-film rehearsal also verifies `reuseOnly` local corrections make no new media submissions.

- Unit/controller/UI tests include semantic plans, unavailable director, explicit-scope enforcement, instruction-as-text rejection, local film corrections and no-media execution, note preservation, separate local/global notes and immutable compiled price approval.
- `scripts/check-saved-feedback.ts` replays the client's original scenes 3 and 8, including typos, in an isolated PostgreSQL schema. It uses the actual saved image contact sheet and an explicitly simulated Claude response. No provider, quote or wallet calls are allowed. Source snapshot remains unchanged.
- `CAM_TEST_TEXT_ONLY=1 scripts/check-whimsical-production.ts` renders a full local film with simulated providers, preserving image requests across a typography change and unrelated scene corrections. Text-only scenes submit no video-model request.
- Proof files: `storage/qa/saved-feedback-proof.json`, `storage/qa/text-only-film-proof.json`, `storage/qa/applied-local-feedback-proof.json`.

Internal diagram: https://whimsical.com/4P7us9wnGGWh3wo2kjRNV6
