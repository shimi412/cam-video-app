# CAM motion design (code-only films)

Validated by Shimi on 2026-10-18 on the film "Plot Hole V4" (`reference/plot-hole-v4-540p.mp4`, 46.2 s, 9:16). The grammar comes from the CAM concept 2 film of 2026-10-05. The full method, with 13 rules, the step order and known pitfalls, is in `METHOD-fr.md` (French, authoritative).

## What is here

| Path | Role |
|---|---|
| `METHOD-fr.md` | The validated method. Read it before changing anything in this folder. |
| `reference/plot-hole-v4-540p.mp4` | The validated film (low resolution). This is the quality bar. |
| `template/build.py` | Writes `index.html` (HyperFrames + GSAP) from `timing.json`. Contains the reusable machinery (typography fitting with fontTools, `scene/put`, transitions `iris/pan/band/recede_black`, CAM logo `brand_star`, subtitles, `check_holds`) and the Plot Hole scenes A to K as the worked example. |
| `template/compose-audio.py` | Synthesizes music and sound effects locally from `marks.json` (96 BPM grid, soft low effects only). |
| `template/voice/` | Voice pipeline: `pace-voice.py` (breaths between phrases), `timing.py` (word timings with whisper-cli medium; the model path is local to Shimi's Mac), `recale.py` (boundaries snapped to real silences), `script.json` (example script). |
| `template/planche-raccords.py`, `template/detecte-flashs.py` | Visual checks: frames around every transition, flash detection. |
| `template/assets/` | Archivo variable and Montserrat fonts, GSAP, CAM logo lettering. Generated audio (`voix.wav`, `musique.wav`, `bruitages.wav`) is not versioned. |

## How a film is made today (by Claude in a session)

1. Voice (ElevenLabs via Higgsfield: Bram since Shimi's decision of 2026-10-21, Dylan before), then `voice/pace-voice.py`, `voice/timing.py`, `voice/recale.py` produce `timing.json` (phrases + words with start/end).
2. Claude rewrites the scene section of `build.py` for the new script, one scene per phrase, following `METHOD-fr.md`. The machinery above the scenes is kept as is.
3. `python3 build.py` must report voice/visual offsets under 0.3 s and `violations de tenue : 0`.
4. `python3 compose-audio.py`.
5. `npx --yes hyperframes@0.8.91 render . -o out.mp4 --quiet` (about 1 minute for 45 s; needs Node and a headless Chromium).
6. Visual checks, then a validation board (one card per scene with its animated extract, what moves, what it makes understood, Yes/No vote) before the final film.

Cost: no generation credits besides the voice (about 2 credits). The real cost is the Claude session that writes the scenes.

## Integrated application (2026-10-18)

The home page has a **Motion design** category at `/motion/new`. A dedicated
`/motion/[id]` workspace retains the existing review order: animated board,
complete-film visuals, separate finishing, then download. The clay workflow and
its supplier requests are not migrated. See `PLAN.md` for the decisions.

The real writer receives this method, the complete original builder and the
recording's measured timings. It returns Python source, scene explanations and
removed-word checks. A revision selects scene IDs and costs $5 after acceptance;
all other source blocks, captions and machinery must remain byte-identical. The
initial film costs $10, with two revisions maximum ($20 total). Supplier receipts
are stored independently in `motion_runs.state.receipts`; an unknown invoice
cost is never represented as zero. Voice credit quotes are retained as quotes,
not actual invoiced USD.

### Local worker setup

- Apply SQL migrations, including `014_motion_runs.sql`.
- Node 22, the locked dependencies (`pnpm install --frozen-lockfile`) and
  **HyperFrames 0.8.91** are required.
- Create `.venv-motion-runtime` with Python 3.12, then install
  `motion/runtime/requirements.txt` inside it.
- Install `ffmpeg`, `ffprobe`, `whisper-cli` and the local medium Whisper model.
  Install a headless Chromium compatible with HyperFrames. Optional explicit
  paths are documented in `.env.example`; no runtime dependency download occurs.
- The current sandbox uses macOS Seatbelt. A Linux deployment requires an
  equivalent container worker before motion can be enabled. It deliberately
  fails closed rather than executing generated code without isolation.
- Existing connected-mode authentication, execution policy, provider credentials
  and a funded customer wallet remain required for a real launch. Setup and
  tests never create a paid subscription or refill credits.

Generated Python runs without inherited credentials, with job-directory writes
and read-only runtime dependencies. A second AST check preserves all original
functions/imports and rejects runtime mutation. HTML is checked against a small
animation language and a CSP; it is never sent to the customer's browser.
Chromium audits and HyperFrames run inside Seatbelt too. Only authenticated MP4
routes expose review media. The generic media route denies motion directories.

Requests are journaled before submission, with accepted IDs saved for polling.
Unknown submission outcomes require reconciliation, never automatic spending.
The worker holds a database advisory lock and updates a heartbeat. A stopped
worker can be resumed from saved operations. Render/check failures remain visible
and cannot unlock human review or download. Download is bound to the approved
final file hash, and saving to My videos is explicit.

### Offline proof

`pnpm test:motion-journey` uses a disposable database schema, an isolated browser
on port 3121, fixture recording and writer responses, and **real** local rendering.
All external fetches are denied. It exercises per-scene correction pricing,
animated-board approval, full-film review, a deferred sound note, finishing,
exact-file approval and download. Its output is
`storage/qa/motion-journey-proof.json`, with screenshots, measurements and an MP4
in the referenced evidence directory. It does not touch the user's running jobs.

The original recording is preserved as a test fixture in
`reference/plot-hole-v4-voice.wav`; `reference/index.sha256` records the original
HTML hash. The immutable builder reproduces that hash. The original has three
safe-area overflows in two scenes. On 2026-10-18 Shimi explicitly approved
correcting those two framings while retaining the original. The resulting
`reference/plot-hole-v4-safe.py` changes only two text-fitting widths and is now
the worked example sent to the writer. `reference/safe-index.sha256` locks its
HTML. The browser rehearsal verifies both original identity/expected rejection
and corrected-reference identity/success.

The software measures registered hold events, voice/visual offsets, stable
reading bounds, explicitly declared disappearing words, logo visibility and mix
levels. It also compares one encoded video frame per scene with the independently
inspected composition (SSIM minimum 0.96, allowing encoding/raster differences).
A missing font can therefore fail the actual MP4 even when HTML inspection passed.
The CSP permits bundled data fonts only in font-src; executable data URLs and
external connections stay blocked. Finishing rechecks the changed composition
before comparing the encoded result.

These checks supplement human visual review; they cannot establish semantic
relevance or artistic quality by themselves. Approval of the two framing fixes
is not acceptance of every future generated film. See `ACCEPTANCE-fr.md` for the
verified scope, evidence and deployment limitations.
