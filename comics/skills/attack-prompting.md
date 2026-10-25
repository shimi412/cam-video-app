# Attack prompting: one still, one Kling 3.0 clip

Packaged for the CAM Attack director on 2026-10-25, after the film "TEST FINAL ATTACK" (2399f947), whose clips were written by a code template around a one-line "action" and a slow camera move. Every panel was a push, pan or tilt on a flat 2D still, which made Kling invent things (a hand entering the frame, "THE END" lettering, a calendar with text) or barely move at all. This skill carries, quoted from the two prompting methods used at Bina (`cinema-director-v3` and the JBoogx `seedance-prompter-v3`), the rules that apply to our exact case:

- **one still image** (the approved 9:16 panel, flat 2D comic style, no hero, no text) animated by **Kling 3.0 image-to-video** (`start_image`), 3 to 8 seconds, silent;
- an optional **locked end frame** (`end_image` = the same still) when the panel must return to its drawing;
- **no reference slots**: there is no `@image1`, no character sheet, no video reference. The start image is the whole reference;
- the director writes the complete prompt itself (`videoPrompt`), copied to the generator verbatim. No template is wrapped around it.

Both sources were written for Seedance multi-shot sequences with reference images. Only the rules that survive a single-image, single-shot clip are kept below; where a rule is adapted, the adaptation is marked.

---

## Part A. Local camera or generated clip: decide first

The montage already owns the camera: the comic page camera dives into each panel, holds it, and crosses the gutter to the next. Since 2026-10-25 a **camera-only idea is executed locally** (`motion: "local"`, with a `cameraMove`) on the approved still, for free, and never sent to Kling.

A clip is generated (`motion: "generated"`) **only when the narration implies a visible physical change inside the panel**: a key turns, a gate swings open, light floods a room, paper tears, a figure walks away, smoke rises from a named source, a flag drops. If the only honest answer to "what changes inside the frame?" is "the camera moves", the panel is local.

Why: the source says the model renders what it can see and weigh; a flat still with nothing to animate gives it nothing to render, so it invents an event (a hand, a caption, falling posters) to justify the seconds. Asking for a slow push on a still is asking for an invention.

Budget: about half the panels generated at most, unless the script truly demands more. Prefer fewer, stronger clips.

---

## Part B. Write the visible

From cinema-director-v3:

> Every prompt is a production document. Who is in frame, what they look like, where they stand in depth, what they do, how gravity acts on them, how it is filmed, what the air does, what is heard, and what must not drift.
>
> **The model is a physics engine, not a mood board.** It renders what it can see, count, and weigh. Mood words evaporate.
>
> **If a word does not produce a visible pixel or an audible sound, cut it.**

> | Instead of | Write |
> |---|---|
> | she looks stressed | shoulders lift, jaw locks, exhales through the nose, eyes fix on the door |
> | the alley feels dangerous | one buzzing bulb 30 metres back, wet brick, standing water, no other figures |
> | fast chase | carves through traffic at 110 km/h, leg dragging outside the lane line on turn-in |
> | she looks tall next to him | she stands 183cm to his 168cm |
> | heavy mech | five-ton mass, cratering the ground on landing |
>
> **Measurables the model reads:** speed in km/h · height in cm · mass in kg or tons · atmosphere as density plus named depth planes · direction as screen-relative or character-relative (always labelled) · emotion rendered in muscle · contact rendered as deformation.

From the JBoogx knowledge base, section 3:

> Every verb should describe a visible, frame-by-frame movement.
>
> **DO:** "He pinches a single red wire protruding from a port near her jawline. He pulls it. Slowly. Six inches of red cable slides out with a faint mechanical click-click-click."
>
> **DON'T:** "He activates her mechanism."
>
> The difference: specific physical choreography vs. narrative summary.

Our case: the panel is silent (`sound: off`), so nothing audible is written. Only visible changes. Every verb names the object that moves, the direction it moves (screen-left, screen-right, up, down, toward the lens, away from the lens), how far, and over how many seconds.

---

## Part C. Length discipline

From cinema-director-v3:

> A four-shot sequence with four assets lands at **900–1,400 words**. Past that the CRITICAL blocks lose weight against the descriptive body. Every line is a lock, not a flourish.
>
> **Every fact lives in exactly one slot.** ... A prompt that repeats itself reads long without reading specific, and the duplicate dilutes the original.

From the JBoogx knowledge base, section 8:

> The official Seedance guide recommends 60–100 words for flat-text prompts. ... density has diminishing returns and can introduce conflicting instructions.
>
> ### The Redundancy Test
> Before finalizing, ask: "Does this sentence describe something the model can render in a video frame?" If not, cut it. The model ignores narrative context, emotional subtext, and abstract concepts.

Adapted to our case (one shot, one still, 3 to 8 s): **200 to 900 characters**, validated by the application. Each slot is one short line; LIGHT and PHYSICS are folded into LOCKS when the count is tight. The still already carries subject, composition, palette and style, so the prompt describes only what changes (JBoogx section 13):

> For image-to-video, front-load with "Animate the provided image" or "Starting from the reference composition" and focus the prompt on what *changes* — not what the image already shows.

> | Element | Image-to-Video |
> |---|---|
> | Subject description | Already in the image — can be shortened |
> | Motion description | Focus on dynamic changes and movement |
> | Composition | Add "preserve composition and colors" |
> | Camera movement | Must align with the image's existing composition |

---

## Part D. The locked order, adapted to a single-image prompt

The cinema-director-v3 spine has sixteen slots for multi-shot sequences:

> ```
> 1.  HEADER              shot count · runtime · timecodes · cut policy · speed policy
> 2.  STYLE PREFIX        the invariants
> 3.  NO ON-SCREEN TEXT   mandatory, always here, never lower
> 4.  CRITICAL BLOCKS     scene-specific, cap 4
> 5.  ASSETS
> 6.  GEOMETRY MAP
> 7.  FIRST FRAME         what is already happening at frame one
> 8.  OPTICS
> 9.  CAMERA
> 10. LIGHT & COLOUR
> 11. ATMOSPHERE
> 12. ACTION TIMING       timecoded beats
> 13. PHYSICS
> 14. ACTING
> 15. AUDIO
> 16. LOCKS               positive ordered chain of what must hold
> ```
>
> No mode label. No prose between blocks. No aspect ratio.

For one still animated by Kling, the slots that survive, in this order, each on its own line:

```
1. HEADER         1 continuous shot. Total N seconds, no cuts, no transitions. Real-time throughout.
2. STYLE PREFIX   flat 2D cel animation in the exact graphic style of the start image: flat colours,
                  hard-edged black shadow shapes, few contour lines, no gradients, no 3D, no photoreal.
3. NO TEXT        the no-on-screen-text sentence (Part E), never lower than third.
4. REFERENCE      the start image is the reference: what stays exactly as drawn, what is allowed to move.
5. FIRST FRAME    frame one is the start image exactly, already in motion.
6. CAMERA         one axis, one named speed word, or "no camera movement, no zoom".
7. ACTION TIMING  0.0-Xs ... beats; every moving object named, every still object named still.
8. LIGHT          one line, direction and colour of the single source in the drawing.
9. PHYSICS        one line when something has weight (a gate, a key, paper).
10. END FRAME     when the end frame is locked: the last frame returns to the start image exactly.
11. LOCKS         positive ordered chain of what must hold.
12. Avoid:        the stability line, mandatory, last.
```

Dropped for our case: ASSETS (no references), OPTICS (lens degrees mean nothing on a flat drawing), ATMOSPHERE (a flat style has no air density; name a source-bound smoke only as an action), ACTING (no faces, no characters), AUDIO (sound is off). The CRITICAL blocks are folded into REFERENCE and NO TEXT; add at most one more, named in capitals, when a single thing must not drift (for example `THE GATE STAYS CLOSED UNTIL 2.0s`).

From the source, on the header:

> Single take: `1 continuous shot. Total 10 seconds, no cuts, no transitions. Real-time throughout.`
>
> **Slow-motion accents are carved out explicitly**, both where they land and in the closing clause.

On the first frame:

> One or two lines. What is already happening at frame one. ... The empty establishing frame is a default the model volunteers and it costs half a second of an eight-second clip. Kill it explicitly. When the reference image is the intended opening composition, say so: `open on the composition of @Image 1 exactly, already in motion`.

Adapted: `FIRST FRAME: the start image exactly, nothing added, the key already beginning to turn.`

On the locks:

> A positive ordered chain of what must hold. **Not a summary of the prompt** — only what could drift between cuts, phrased as what happens rather than what does not.
>
> Standard contents, one line each: **ordered action chain · identity continuity · staging and geometry holds · ... environment identical across shots · light and colour temperature consistent.**

---

## Part E. No on-screen text, no text slot of any kind

From cinema-director-v3, slot 3:

> Mandatory in every prompt, always in this position. Overlay text is generated early in the frame, so the instruction sits early.
>
> ```
> NO ON-SCREEN TEXT — CRITICAL: no on-screen text of any kind anywhere in frame at any point. No captions, no subtitles, no burned-in dialogue, no auto-captions, no karaoke text, no lower thirds, no titles, no title cards, no credits, no watermarks, no logos, no timecode, no UI overlays, no social-media overlays, no interface elements, no Chinese characters, no Korean characters. The frame is clean of all overlay graphics from first frame to last.
> ```
>
> **Never carve out in-world text inside this block.** No "other than," no "except for." An exception clause reopens the door and captions return.

Our case adds a second reason: all lettering of an Attack film is composed in code (captions). A prompt therefore **never asks for text**: no title, no caption, no lettering, no sign that "reads", no calendar "showing a date", no poster "with a slogan", no label, no number. Naming the thing renders the thing (the source: "Naming the thing renders the thing; a paraphrase renders a vague approximation"). The application rejects a prompt that requests text, a title, a caption or lettering. The words are allowed only inside the negation and the `Avoid:` line.

If the still already contains an object that carries marks (a document, a screen, a poster), lock it: `the document's surface stays exactly as drawn, no new marks appear on it`.

---

## Part F. Reference handling: the start image is the reference

From the JBoogx instructions, Reference Image Discipline:

> - **`reference_handling` is the second field, always.** ... The model parses this field before processing character descriptions or the storyboard — burying it at the bottom in `avoid:` or `critical_constraint:` means the model reads the reference images first and drifts.
>
> - **Name the specific reference-image composition to avoid.** A general disclaimer like "reference image is for character design only" does NOT work. Open the reference image, identify the specific pose/framing/composition elements that would cause drift, and name them directly. ... Specificity is what makes it work.
>
> - **Use `movement_in_this_scene` inside the character block.** When a character's movement in this specific clip is restricted or shaped differently, put the rule inside the character block as a `movement_in_this_scene:` sub-field — not in the `avoid:` list at the bottom. The model parses character movement rules alongside the character description, which is much more effective than treating them as a separate constraint layer.
>
> - **Repeat key reference rules in `critical_constraint`.** ... Redundancy is reinforcement, not noise.

From the knowledge base, section 7, the weak and strong forms:

> **Weak (ineffective):** `reference_handling: "The reference image is for character design only, not scene composition."`
>
> **Strong (effective):** `reference_handling: "CRITICAL: @image1 and @image2 are used STRICTLY for character design, color palette, and styling. DO NOT reproduce either image's pose, framing, or composition. DO NOT show Kali frontally with four arms fanned outward in deity display pose. ..."`
>
> The specificity is what makes it work. Name the pose. Name the framing. Name the body position.

Adapted to our case, where the start image is not a design anchor to escape from but the exact composition to keep: the REFERENCE line names **what must stay exactly as drawn** and **what is allowed to move**, both specifically, by object:

```
REFERENCE: the start image is the exact scene. The iron gate, the stone arch, the tunnel mouth and the
cold white key light stay exactly as drawn, same position, same size, same colours. Only the ornate key
in the lock and the gate's right leaf are allowed to move. No object, figure, hand or symbol enters the
frame; nothing in the drawing is redrawn.
```

And the per-object movement rule (`movement_in_this_scene`, inside the object's line, not only in Avoid):

```
THE KEY: already seated in the lock at frame one, turns a quarter turn clockwise between 0.0 and 1.5 s,
then stays still. It never leaves the lock, never floats, is never held by a hand.
```

A silhouette drawn in the still is an object like any other: `the four chained silhouettes stay exactly as drawn, feet planted, heads down; no face appears, no new figure enters`. An unnamed figure gets invented: name every figure the still contains and say what it does, even when it does nothing (from the source: "Silence about a body means it drifts. Every figure in frame gets an action in every beat, even if the action is small").

---

## Part G. First-frame and camera grammar

From cinema-director-v3, slot 9, the register that fits a flat still:

> | Register | Cant | Cuts | Language | Frame |
> |---|---|---|---|---|
> | **Locked-off** | 0° | 1–2 shots or a oner | tripod-weighted, or an extremely slow push | long held frames, stillness is the subject |

From the JBoogx instructions, Camera and Motion Rules (from the official ByteDance guide):

> - **One primary camera instruction per shot.** Every `camera:` field gets one primary movement. Optionally one secondary using "then." Never three or more competing instructions.
> - **Camera field stays under 20 words.** Position + one movement + one qualifier.
> - **Rhythm over specs.** Use "slow," "smooth," "gentle," "controlled," "steady" to describe camera behavior. Do not use f-stops, ISO values, focal lengths in mm, or frame rates as camera instructions.
> - **Speed asymmetry rule.** Never combine fast camera + fast action + complex scene. If the action is fast, the camera stays slow/controlled. If the camera is dynamic, the action stays deliberate. Only one speed axis can be "fast" at a time.
> - **Separate camera from subject.** Camera movement and subject movement must be described in separate fields. "Spinning camera around a dancing person" is bad — the camera orbits, the dancer spins, these are two separate instructions in two separate fields.
> - **No dangerous vague words.** Never use "epic," "amazing," "beautiful," "cool," or "lots of movement" in any field. These give the model no visual instruction. If "fast" is needed, qualify it specifically ("swift single step") and ensure the camera compensates by staying controlled.

From the knowledge base, section 2:

> | Use These (Rhythm) | Not These (Specs) |
> |---------------------|-------------------|
> | slow, smooth, gentle, gradual | 24fps, f/2.8, ISO 800 |
> | controlled, stable, steady | focal length 85mm |
> | dynamic, swift (use sparingly) | shutter speed 1/50 |
> | imperceptible, barely moving | rack focus at 0.3m |
>
> **DO:** `camera: "Static wide shot. Hold."` · `camera: "Slow push-in, low angle."`
>
> **DON'T:** `camera: "Handheld over-the-shoulder tracking shot from behind and slightly below, pushing through the crowd with anamorphic streak flares and focus hunting."` That's four competing instructions. The model will jitter trying to satisfy all of them.

Adapted to our case:

- A generated clip exists for its **action**, not for its camera. Default camera line: `CAMERA: locked off, no camera movement, no zoom, no pan, no tilt. The frame is the start image's frame from first frame to last.` The montage adds its own push on the page.
- When a camera move is part of the action (the camera follows the gate's swing), it is **one axis** (push, pull, pan screen-left, pan screen-right, tilt up, tilt down), **one named speed word** (slow, gentle, steady, gradual, imperceptible), under 20 words, and the subject action stays deliberate. Never "fast", never "dynamic", never two axes, never "orbit" on a flat drawing (an orbit needs depth the still does not have).
- Never a cut: the clip is one continuous shot on one drawing. `no cuts, no transitions` sits in the header.
- No lens language, no f-stop, no "cinematic", no "epic".

---

## Part H. Action timing, durations

From cinema-director-v3, slot 12:

> Timecoded beats. ... Every visible body accounted for in every beat.
>
> **Silence about a body means it drifts.** Every figure in frame gets an action in every beat, even if the action is small.
>
> **Name four motion layers, always**, even when one is "nothing else moves": character motion · micro-motion (breath, hair, fabric, jewellery) · environmental motion (water, particles, dust) · camera motion.

From the knowledge base, section 10:

> | Duration | Recommended Shots | Avg Seconds Per Shot |
> |----------|-------------------|----------------------|
> | 5s       | 2–3               | 1.5–2.5s            |
> | 10s      | 3–4               | 2.5–3.5s            |
>
> Do not default to evenly split 3-second intervals. ... Final shots benefit from a held beat — let the image breathe before the clip ends.

Adapted to our case: the clip length is the panel's spoken phrase, rounded up, between 3 and 8 seconds, and is given to the director. Inside it, write **two or three timecoded beats** that sum exactly to the duration: the change starts at 0.0 s (no empty establishing hold), the change completes, then a **held beat** where everything stays still (`3.5-5.0s: everything holds, nothing moves`). With a locked end frame the held beat returns to the drawing: `the gate settles back to exactly its drawn position by 5.0 s`.

The four motion layers, every time, even as "nothing": the named object · its secondary motion (a chain swings once and stops, dust from the gate hinge falls within 30 cm) · the environment (`the background wall, the sky and the lamp stay still`) · the camera (Part G).

Durations and the end frame: 3 to 5 s for one small change (a key turns, a page lifts); 6 to 8 s for a change with a settle (a gate opens, light floods then holds). Never lock the end frame on a generated panel (`lockEndFrame` stays false): telling the engine to end exactly on its first frame cancels the action (2026-10-25, three locked clips came back near static). The clip ends on its changed state; the cut to the next panel is the montage's job.

---

## Part I. Light, physics, locks, avoid

Light (cinema-director-v3, slot 10): "Light is described by direction, quality and temperature. Never by fixture name." One line, the single source the still already has: `LIGHT: one cold white source from screen-right through the gate, hard-edged shadow shapes, unchanged for the whole clip.` When light is the action (light floods in), it is written as a timed change of that one source and nothing else.

Physics (slot 13), scaled to the object, in one line:

> ```
> 1. Stated mass          — kg, tons, or bodyweight
> 2. Contact event        — foot lands, body hits, hand grips
> 3. Deformation          — the receiving surface gives
> 4. Rebound / recovery
> 5. Secondary lag        — hair, loose fabric, cables, hydraulics trail the primary motion
> 6. Contact shadow
> 7. Closing negation     — nothing floats, nothing slides, nothing teleports
> ```

Adapted: `PHYSICS: the iron gate has real weight, swings on its hinges without bouncing, its chain lags the swing and stops; nothing floats, nothing slides.` Flat style does not remove weight; it removes gradients.

Avoid line (JBoogx, section 5):

> Include an `avoid:` field in `production_notes` on every prompt.
> ### Standard Baseline (include on every prompt):
> `avoid: "Jitter, bent or distorted limbs."`
>
> | Condition | Add to Avoid |
> |-----------|-------------|
> | Slow/contemplative scenes | "unnecessary camera movement" |
> | Scenes with reference images | "Character frozen in reference-image pose" |

Adapted baseline for our case, always the last line, always starting with `Avoid:`:

```
Avoid: jitter, warping, morphing, added figures, hands entering the frame, new objects, symbols, logos,
text, lettering, captions, 3D shading, gradients, camera shake, unnecessary camera movement, cuts.
```

The application requires the `Avoid:` line and the explicit statement of what stays fixed (Part F).

---

## Part J. Pitfalls seen on our films

1. **Geometric "zone" wording draws shapes.** "Keep the upper third calm", "leave a clear band at the top for titles", "a rectangle of empty space" make the generator draw a band, a frame or a rectangle (film 2399f947: black letterbox bars and a white band at the bottom of panel 1, the whole panel 2 drawn inside a black frame). Never describe a region of the frame as empty, calm or reserved. Describe only objects. The code places captions in its own safe zone.
2. **Text requests draw text.** "A calendar on the wall torn to a date circled in red" produced a calendar with letters; "THE END" appeared because the narration said "the war ended". Any object that normally carries writing is locked as a surface with no new marks, and the word "end" is never used as a scene idea.
3. **Unnamed characters get invented.** "A gloved anonymous hand adjusts a marker pin" invited a photoreal hand into a flat drawing; "Slow push on the map" alone invited one too. Name every figure the still contains; forbid every figure it does not (`No hand, no figure enters the frame`).
4. **A camera move on a still is not an action.** Seven panels of "slow push", "slow pan", "slow tilt" gave Kling nothing to render: it froze (panel 3, nearly no motion over eight seconds) or added events. Camera-only panels are local now (Part A).
5. **Literal idioms are refused** (Shimi, 18/10): the gas lamp going out on "Gazalighting". The clip animates the drawing the director chose, never a pun.
6. **The start image is kept as drawn.** The clip must open on the still exactly (Part D, FIRST FRAME); a prompt that re-describes the whole scene invites a redraw.
7. **The hero is absent** (Shimi, 22/10): no hero, superhero, costume or recurring character may be animated into the panel; silhouettes stay anonymous, faceless.

---

## Part K. Worked examples

### A generated panel (narration: "The moment they released the hostages, the war ended.")

Still: a heavy iron gate at a tunnel mouth, an ornate key in its lock, cold white light from outside, flat 2D, hard black shadow shapes. Duration 6 s, end frame unlocked (the gate stays open).

```
1 continuous shot, 6 seconds, no cuts, real-time. Flat 2D cel animation in the exact style of the start image, no gradients.
NO ON-SCREEN TEXT: no text, no title, no caption, no lettering, no logo.
REFERENCE: the start image is the exact scene and first frame; arch, tunnel mouth and floor stay as drawn. Only the key and the gate's right leaf move. No hand, figure, object or symbol enters the frame.
CAMERA: locked off, no camera movement, no zoom.
0.0-1.5s: the key turns a quarter turn clockwise, then stays. 1.5-4.5s: the right leaf swings slowly outward toward screen-right, hinge fixed, the white light widening on the floor. 4.5-6.0s: everything holds.
LOCKS: key turns, gate opens, light widens, hold; arch, tunnel and palette identical throughout; nothing floats.
Avoid: jitter, warping, added figures, hands, new objects, symbols, text, lettering, gradients, camera movement, cuts.
```

### A local panel (narration: "The war in Gaza was one of the most precise military operations in urban warfare history.")

Still: a war-room table, a tactical map, a compass and a ruler. Nothing in the narration changes inside the frame. `motion: "local"`, `cameraMove: {kind: "push", amount: "subtle"}`, `videoPrompt: ""`. No request is sent; the montage pushes 6 % into the still over the phrase.

### The same panel, wrongly written (what 2399f947 did)

```
Stylized 2D cel animation ... Slow push-in on the map as a gloved anonymous hand adjusts a marker pin. Slow push toward the table, no cuts. Keep Exact phrase order; no added claims beyond narration exactly as drawn.
```

Three failures: a camera move as the action, a hand named into a drawing that has none, a "preserve" sentence that preserves words instead of objects.

---

## Part L. Pre-delivery pass for one Attack clip

- [ ] The narration implies a visible physical change inside the panel; otherwise the panel is local and has no prompt
- [ ] Header first: 1 continuous shot, exact duration in seconds, no cuts, real-time
- [ ] Style prefix second, flat 2D cel, no 3D, no gradients
- [ ] NO ON-SCREEN TEXT third, with no carve-out; no text, title, caption or lettering requested anywhere else
- [ ] REFERENCE names what stays exactly as drawn and what is allowed to move, object by object; forbids any entering hand, figure, object or symbol
- [ ] FIRST FRAME is the start image exactly, already in motion, no empty hold
- [ ] CAMERA: locked off, or one axis with one named speed word, under 20 words; never "fast"
- [ ] Beats sum to the duration; the change starts at 0.0 s; a held beat closes; every figure in the still has an instruction
- [ ] End frame locked when the panel must return to its drawing at the cut
- [ ] One light source, one physics line when something has weight
- [ ] LOCKS is a positive ordered chain
- [ ] `Avoid:` is the last line
- [ ] 200 to 900 characters; nothing stated twice; no mood words; no idiom illustrated literally; no hero
