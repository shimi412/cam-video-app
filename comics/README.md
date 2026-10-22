# CAM comics category: "attack" videos

Validated by Shimi on 2026-10-18 on the film "Gazalighting" (`reference/gazalighting-v4-540p.mp4`, 59 s, 9:16). Third CAM category, beside clay and code-only motion design. Method in `METHOD-fr.md` (French, authoritative), prompt formulas in `PROMPTS-fr.md`.

## What it is

A response ("attack") video in a 2D comic-book universe. One panel per script phrase. Each panel is a generated key image (Nano Banana Pro 2K) animated by a short Kling 3.0 Pro clip. The montage is code (HyperFrames + GSAP): all clips live in the panels of one giant comic page; the camera dives into a panel, holds it during the phrase, pulls back through the gutter and dives into the next. All text is code: yellow caption boxes with the spoken word in red, titles, onomatopoeia, stamps, counters. The film ends on the animated CAM logo of the 2026-10-05 film.

Client feedback built in (Sacha, 2026-10-05): the universe carries the story; the hero appears in at most a third of the panels, mostly partially, never as the subject of every panel.

## Files

| Path | Role |
|---|---|
| `METHOD-fr.md` | Validated method: steps, rules, pitfalls, feedback history, quality control. |
| `PROMPTS-fr.md` | Validated prompt formulas (storyboard, key image, clip, voice) and locked references. |
| `reference/gazalighting-v4-540p.mp4` | Validated film (quality bar). |
| `reference/storyboard-gazalighting.jpg` | Storyboard sheet of that film. |
| `reference/prompts-gazalighting.json` | Every generation request of that film, verbatim. |
| `template/build.py` | Montage: comic page layout, camera, titles, captions, stamps, counter, CAM logo (`brand_star`), and the two quality checks (`check` of on-screen durations; holds). Reads `timing.json` and `assets/clips/case-NN.mp4`. |
| `template/compose-audio.py` | Local synthesized music and soft low sound effects from `cues.json`. |
| `template/detecte-flashs.py` | Frame-level flash detector on the rendered MP4 (anything that appears and disappears in under 0.8 s). |
| `template/voice/` | `timing.py` (whisper-cli word timings), `pace-voice.py` (breaths between phrases), example `script.json`. |
| `template/tools/pose-embleme.py` | Replaces the closed star drawn by the image model with the exact CAM emblem. |
| `template/assets/` | Bangers and Montserrat fonts, GSAP, CAM logo files. Clips, stills and audio are generated per film and not versioned. |

## How a film is made today (by Claude in a session)

1. Script split into one panel per phrase (what we see, hero present or not, dominant colour, code title).
2. Voice (Harrison), breaths, word timings.
3. Storyboard image, then one key image per panel; fixes (emblem, borders) locally.
4. Human validation board (one card per panel: image, text read, what we see, what it makes understood, what will move; Yes/No).
5. One Kling clip per approved panel; frame-by-frame check of every clip (Kling adds stars, fake text, unrequested actions).
6. `python3 build.py` (stops if any on-screen element is visible less than 0.8 s), `npx --yes hyperframes@0.8.91 render . -o out.mp4 --quiet`, `python3 detecte-flashs.py out.mp4`, contact sheet with Instagram safe zones, loudness about -16 LUFS.

Cost of the reference film: about 130 Higgsfield credits including revisions (key images ~26, clips ~83, voices ~14, storyboard 2).
