# Seedance 2.0 Prompter — Master Knowledge Base v3

This document is the reference library for generating Seedance 2.0 cinematic prompts. It contains the template anatomy, field-by-field guidance, model-specific rules derived from the official ByteDance prompt guide, reference-image discipline (hard-won from production), genre adaptation patterns, and full example prompts.

---

## 1. Template Anatomy

The prompt template has four layers. Each layer must be present in every prompt.

### Layer 1: Scene Identity
Establishes the global visual contract. Everything in the storyboard is filtered through this.

- `title:` — Short, evocative name for the scene.
- `reference_handling:` — **REQUIRED AS THE SECOND FIELD.** Governs how reference images are used. See Section 7 for full rules.
- `style:` — The genre, aesthetic reference, and visual philosophy. This is the single most important stylistic field. Be specific: name cinematic references, art movements, production styles. Resolution targets (4K, 2K) belong here as style anchors, not as technical specs.
- `visual_feel:` — Describe the visual rhythm and texture of the footage using sensory language. Prioritize words like "slow," "smooth," "warm," "gritty," "stable," "dreamy," "handheld," "gentle." Technical camera specs (f-stops, ISO, focal length in mm) should be avoided — the model responds to rhythmic feel descriptors, not photography jargon. Rendering intentions (subsurface scattering, volumetric fog, film grain) are acceptable here because they describe visible texture, not camera settings.
- `duration:` — Clip length in seconds. Drives the storyboard segmentation.

### Layer 2: Character Modeling
Every entity that appears on screen — characters, objects, hands, creatures, props with agency — must be defined here before the storyboard begins.

Required sub-fields per character:
- `base:` — What it is and which reference image it matches (if any). Format: `"matching reference @image1"` with NO space between @ and image number.
- `features:` — Physical description. Specific enough to render: colors by name, materials by texture, wardrobe by item.
- `physics / personality / detail:` — How it moves, deforms, or emotes. Material behavior (jiggles, flexes, glows). Personality expressed through physicality, not adjectives.

Conditionally included sub-fields (use when relevant):
- `movement_in_this_scene:` — Use this sub-field INSIDE the character block to specify movement restrictions for that character in this specific clip. Example: *"Raktabija is NEVER shown running or charging in this scene. He fights in close quarters — grappling, slamming, swinging at close range. His mouth is NOT constantly gaping wide — he snarls, bites, roars, closes."* This places movement rules adjacent to the character description where the model parses them together, rather than buried in the `avoid` list at the bottom.
- `emotional_state:` — For character-heavy dramatic scenes, use this to specify the tone and demeanor the character carries throughout. Example: *"Kali is in rapturous combat ecstasy — back arching into hits, tongue extending longer and wetter, small moans between blows. NOT distress — tantric fury, divine communion, intoxicated control."*
- `state_in_this_scene:` — For multi-clip sequences, use this to specify the character's starting state in this clip (wounds, missing parts, posture, current activity). See Section 7 on damage continuity.
- `power:` or `power_this_scene:` — For characters with specific abilities that activate in this clip, describe the mechanical behavior of the power so the model can render it.

### Layer 3: Cinematic Storyboard
The shot-by-shot timeline. Every second of the clip must be accounted for in discrete timestamp ranges. **Stagger shot durations based on scene rhythm — do not default to evenly split intervals.** See Section 10.

Timestamp format: `XX_YY_[shot_name]` where XX is start second and YY is end second.

Required per shot:
- `camera:` — One primary movement instruction. Optionally one secondary. Never more than two. Describe using rhythm words rather than technical parameters. See Section 2 for the full camera discipline system.
- `action:` — Specific physical movements. Choreography, not summary. Every action should be visually renderable.
- `lighting:` — Brief per-shot lighting note. Even 3–5 words here has outsized impact on output quality.

Conditionally included per shot:
- `dialogue:` — Exact lines if spoken.
- `vfx:` — Particle effects, material transformations, physics events.
- `reaction:` — Character response if separate from main action.
- `sfx:` — Sound effects tied to this specific beat.

### Layer 4: Production Notes
Contextual information that applies across the whole scene but lives outside the timeline.

Common sub-fields:
- `audio_design:` — Sound philosophy, music cues, silence, ambient tone.
- `lighting:` — Overall lighting strategy and shifts across the clip. Per-shot lighting notes in the storyboard override this for their specific beat.
- `subtext:` — What the scene is really about. Emotional thesis. Comedic logic. Lore grounding.
- `critical_constraint:` — Hard creative rules the model must respect. Spatial continuity rules for multi-character scenes (e.g., "both characters face each other across the aisle throughout"). Repeat key reference-handling rules here for extra enforcement.
- `avoid:` — Model stability constraints. Standard baseline: "avoid jitter and bent limbs." See Section 5.
- `animation_style:` — Frame rate cadence, interpolation rules, stop-motion holds.

---

## 2. Camera Discipline System

### The One-Primary Rule
Every `camera:` field must have **one primary movement instruction.** Optionally add **one secondary instruction** using "then" to sequence them. Never stack three or more.

**DO:**
```
camera: "Slow push-in, low angle."
camera: "Handheld tracking shot, then gentle rise."
camera: "Static wide shot. Hold."
```

**DON'T:**
```
camera: "Handheld over-the-shoulder tracking shot from behind and slightly below, pushing through the crowd with anamorphic streak flares and focus hunting."
```
That's four competing instructions. The model will jitter trying to satisfy all of them.

### Rhythm Over Specs
The model responds to rhythm language, not technical parameters.

| Use These (Rhythm) | Not These (Specs) |
|---------------------|-------------------|
| slow, smooth, gentle, gradual | 24fps, f/2.8, ISO 800 |
| controlled, stable, steady | focal length 85mm |
| dynamic, swift (use sparingly) | shutter speed 1/50 |
| imperceptible, barely moving | rack focus at 0.3m |

Technical specs can appear in `style:` as aesthetic anchors ("35mm film tone") but should not drive camera behavior.

### Speed Asymmetry Rule
**Never combine fast camera movement + fast subject action + complex scene.** This is the #1 cause of artifacts and jitter.

- If the action is fast → camera should be slow/stable.
- If the camera is dynamic → action should be controlled/deliberate.
- Complex scenes (many elements, particles, crowd) → both camera and action should be slow.

Only one speed axis can be "fast" at a time.

### Separate Camera from Subject
Camera movement and subject movement must be described independently. Don't blend them.

**DO:**
```
camera: "Fixed wide shot. Hold."
action: "The dancer spins slowly across the frame."
```

**DON'T:**
```
camera: "Spinning camera around a dancing person."
```

### Supported Camera Types

| Camera Type | Best For |
|-------------|----------|
| Push-in / dolly in | Close-up emphasis, emotional focus |
| Pull-out / dolly out | Environmental reveal, context |
| Pan / lateral | Tracking, scanning |
| Tracking / follow | Action, walking |
| Orbit / arc | Product showcase, portraits |
| Aerial / drone | Landscapes, scale |
| Handheld | Documentary, realism |
| Fixed / locked-off | Focus on subject action |
| Tilt | Reveals, scale emphasis |
| Crane | Dramatic transitions |

### Position/Angle Vocabulary
Use these to set the camera's starting position before describing its movement:

- Extreme macro close-up
- Low tabletop angle
- Over-the-shoulder
- High-angle master shot
- Dutch angle (tilted frame)
- First-person POV
- Low angle looking up
- Medium two-shot
- Wide establishing shot
- Overhead top-down
- 90-degree side profile at ground level
- Extreme low-angle worm's-eye
- Inverted orientation (upside-down)
- Lateral side-view two-shot

### Lens Effects
These belong in `visual_feel:` or `vfx:` — not crammed into the `camera:` field:

- Focus rack between subjects
- Shallow DOF with soft bokeh
- Anamorphic streak flares
- Film grain
- Motion blur
- Lens distortion on edges

---

## 3. Action Writing Rules

Every verb should describe a visible, frame-by-frame movement.

**DO:**
- "Her eyes well up with tears. She pouts her lips excessively. She quickly grabs all three daifukus, hugging them to her chest."
- "He pinches a single red wire protruding from a port near her jawline. He pulls it. Slowly. Six inches of red cable slides out with a faint mechanical click-click-click."
- "The chasen tips forward and plunges its bristle head deep into the mound of matcha powder. It swirls slowly — once, twice — coating every bristle tip in vivid green."

**DON'T:**
- "She gets upset and grabs the food."
- "He activates her mechanism."
- "The brush gets matcha on it."

The difference: specific physical choreography vs. narrative summary. Every verb should describe a visible, frame-by-frame movement.

### Dangerous Action Words
Avoid vague intensity modifiers that give the model no visual instruction:

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| "epic" | Model doesn't know what it means | Describe the specific visual effect |
| "amazing" / "beautiful" | Adjectives without guidance | Specific lighting, composition, texture |
| "lots of movement" | Causes jitter from over-motion | One specific, described motion |
| "fast" (unqualified) | Causes chaos without direction | "swift single step" or keep action slow |
| "cool" / "dynamic" | Vague aesthetic | Name the exact aesthetic reference |

---

## 4. Lighting as a Lever

The official Seedance guide identifies lighting description as the **highest-leverage single element** in any prompt. One lighting line does more for output quality than ten adjectives.

### Per-Shot Lighting
Every shot block should include a `lighting:` field, even if it's brief. Examples:

```
lighting: "Warm golden-hour backlight through window."
lighting: "Single red overhead wash, everything else dark."
lighting: "Soft overcast diffused light, even and flat."
lighting: "Neon blue rim light against deep shadow."
lighting: "Strobe pulses, white and violet, through haze."
```

### High-Impact Lighting Keywords

| Keyword | Effect |
|---------|--------|
| golden hour | Warm golden tones, long shadows |
| rim light | Edge highlights separating subject from background |
| natural light | Soft, realistic illumination |
| neon | Colored glow, cyberpunk/urban |
| backlit | Silhouette potential, dramatic depth |
| overcast | Even, diffused, no harsh shadows |
| volumetric | Light rays visible through fog/haze/dust |
| practical light | Light source visible in frame (lamp, candle, screen) |

### Overall Lighting Strategy
Still include in `production_notes` → `lighting:` for the global philosophy. Per-shot notes override for their specific beat.

---

## 5. Stability Constraints (Negative Prompts)

Include an `avoid:` field in `production_notes` on every prompt.

### Standard Baseline (include on every prompt):
```
avoid: "Jitter, bent or distorted limbs."
```

### Add Based on Scene Type:

| Condition | Add to Avoid |
|-----------|-------------|
| Clips over 10 seconds | "temporal flicker" |
| Character-driven scenes | "identity drift" |
| Complex scenes (crowd, particles, many elements) | "chaotic composition" |
| Multi-shot with same character | "inconsistent features between shots" |
| Slow/contemplative scenes | "unnecessary camera movement" |
| Scenes with reference images | "Character frozen in reference-image pose" (see Section 7) |

### Words That Degrade Quality
These keywords in any field tend to produce worse output:

- "fast" without qualification
- "cinematic" used alone (too vague — always pair with a specific reference)
- "epic" (meaningless to the model)
- "amazing" / "beautiful" / "stunning" (adjectives without visual instruction)
- Stacking multiple unqualified speed words

---

## 6. Genre Adaptation Patterns

The template skeleton stays the same. The vocabulary, density, and emphasis shift by genre.

### Cute / Kawaii / Stop-Motion
- `style:` references Laika, Aardman, Pixar short films. Names material textures (clay, felt, dough).
- Character modeling emphasizes tactile material physics (jiggles, squishes, bounces).
- Action lines lean into exaggerated expressions and held comedic beats.
- Production notes specify animation cadence ("stop-motion holds and pops, no smooth tweening").
- SFX are diegetic and ASMR-forward.
- Camera should be mostly fixed or slow. Let the characters carry the energy.

### Cyberpunk / Horror / Action
- `style:` references specific films or directors, volumetric atmospheric effects.
- Character modeling emphasizes material science (automotive paint sheen, translucent tubing, chrome vertebrae).
- Action lines are rapid and precisely sequenced — but apply the speed asymmetry rule.
- Camera work can be aggressive but must still follow the one-primary rule.
- Audio design often uses silence as a weapon — contrast between chaos and dead quiet.

### Comedy / Dramedy / Dialogue-Driven
- `style:` references specific shows or directors for comedic timing.
- Character modeling includes personality and wardrobe as comedy signals.
- Storyboard is paced around dialogue beats, not visual spectacle.
- Camera work uses snap-zooms and held reaction shots for comedic timing.
- Production notes include a `subtext:` field explaining the joke's underlying logic.

### Anime / Moe / Japanese Healing
- `style:` references specific anime aesthetics (4K Moe, healing genre, ukiyo-e).
- Character modeling includes anime-specific features (ahoge, chibi proportions, star-highlights in eyes).
- VFX stays stylized — painted-on effects, 2D surface animation, watercolor dissolves.
- Lighting is warm, golden-hour, with soft-focus bokeh. Per-shot lighting notes matter here.
- Audio tends toward quiet ambient and ASMR.

### Game / HUD / Interactive Style
- `style:` specifies game genre and perspective (TPS, FPS, ADS transitions).
- Adds a `ui_overlay:` section with HUD element placement.
- Adds `animation_logic:` with state machines (start_state → mechanics → end_state).
- Camera describes perspective transitions as single primary instructions per beat.

### Brutal Deity Combat / Mythological Violence
- `style:` references specific anime combat lineages (Samurai Champloo, Ninja Scroll, Madhouse-era violence).
- `subtext:` grounds attacks and dialogue in specific lore sources. Research the mythology before writing — actual canonical powers land harder than invented ones.
- Physical damage must be visible and carried forward between clips (see Section 7).
- Both combatants must be in constant motion — no static tableau moments mid-fight.
- Spatial layout (who is on which side, facing which direction) must be locked throughout the scene and stated in `critical_constraint`.
- Audio design layers combatants' distinct vocal signatures throughout — breathing, growls, feral laughs, pain sounds — alongside wet organic impacts on every strike.

---

## 7. Reference Image Discipline

**This section is the most important one in this document for multi-clip production work. The failures that happen early in any project are almost always failures of reference discipline. Apply these rules from the first prompt and cold-start drift disappears.**

### The Core Problem
Reference images are labeled `@image1`, `@image2`, etc. The model reads them first, processes their compositions, poses, and framings, and uses that visual information as a prior for how the scene should look. If the prompt's anti-reference language is buried at the bottom in `avoid:` or `critical_constraint:`, the model sees the image composition before it sees the instruction not to reproduce it. The result is scene drift back toward the reference image pose.

### Rule 1: `reference_handling` is the second field, always
Place a `reference_handling:` field immediately after `title:` and before `style:`. This ensures the model parses the reference-use instructions before processing character descriptions or the storyboard. Non-negotiable for any prompt using reference images.

### Rule 2: Name the specific reference-image composition to avoid
A general disclaimer like "reference image is for character design only" does not work. The model needs the failure mode described by name. Open the reference image, identify the specific pose/framing/composition elements that would cause drift, and name them directly.

**Weak (ineffective):**
```
reference_handling: "The reference image is for character design only, not scene composition."
```

**Strong (effective):**
```
reference_handling: "CRITICAL: @image1 and @image2 are used STRICTLY for character design, color palette, and styling. DO NOT reproduce either image's pose, framing, or composition. DO NOT show Kali frontally with four arms fanned outward in deity display pose. DO NOT show Raktabija running forward with cleaver raised overhead at the camera. DO NOT show mini-clones in a forward-charge low-angle composition at the lens."
```

The specificity is what makes it work. Name the pose. Name the framing. Name the body position. Name the angle relationship to the camera.

### Rule 3: Describe framings that are spatially incompatible with the reference images
The most powerful anti-drift technique is choosing shot compositions that the reference image physically cannot fit into. If the reference shows a character standing frontally in a medium shot, an extreme macro on their hand, an overhead top-down, a 90-degree side profile at ground level, an inverted upside-down close-up, or an over-the-shoulder from behind all make it geometrically impossible for the model to retreat into the reference pose.

**Incompatible framing examples:**
- Extreme macro close-up on a specific body part (hands, eyes, wound, weapon edge)
- Overhead top-down looking straight down
- 90-degree horizontal side profile at ground level
- Over-the-shoulder from directly behind
- Inverted / upside-down close-up
- First-person POV from another character's eyes
- Extreme low-angle worm's-eye looking up past feet
- Close-up on a specific detail (a droplet, a clawed foot, a garland head)

Rotate through these framings across the shots of a clip. No repeated framing twice within the same clip. Varied angles create kinetic rhythm and prevent any single frame from slipping into reference pose.

### Rule 4: Use `movement_in_this_scene` inside the character block
When a character's movement in this specific clip is restricted or shaped differently than their general behavior, put the rule inside the character block as a `movement_in_this_scene:` sub-field. Example:

```yaml
raktabija:
  base: "Massive red-skinned asura. Reference @image2 for CHARACTER DESIGN ONLY — not pose or blocking."
  features: "[...]"
  movement_in_this_scene: "Raktabija is NEVER shown running forward with cleaver overhead in this scene. He fights in close quarters — grappling, slamming, swinging at close range. His mouth is NOT constantly gaping wide — he snarls, bites, roars, closes."
```

The model parses character movement rules alongside the character description, not as a separate constraint layer. Much more effective than putting the same restriction in the `avoid:` list at the bottom.

### Rule 5: Carry visible physical damage forward between clips
For multi-clip sequences where a character sustains damage in a previous clip, describe the damage explicitly in this clip's character block via the `features:` or `state_in_this_scene:` sub-fields. Example:

```yaml
raktabija:
  features: "Bald domed head with ONE curved horn (the other was ripped off during the previous round, leaving a bloody bone stump on his skull). Four yellow eyes in diamond pattern — one is ruptured and empty, oozing yellow fluid and blood (damaged in the previous round). [...]"
```

Carrying damage forward does two things:
1. Prevents narrative reset between clips (no model memory across generations, so you must re-establish).
2. Gives the model a sharper, more specific character design to lock onto — a damaged character is more unique than a clean one, which reduces drift back toward the reference image.

This rule is especially important for sequences longer than three clips. By clip five, your characters should look visibly battered if the story has been escalating.

### Rule 6: Reference tag formatting
- No space between @ and the image number: `@image1` not `@ image1`.
- Use `@image1`, `@image2`, `@video1` as the standard labels in the order received.
- When citing a video reference for direct continuation, the prompt can open with `prompt_start: "Continue from @video1."` as the first field before `title:`.

### Rule 7: Repeat key reference rules in `critical_constraint`
Even with `reference_handling` at the top, restating the most important anti-drift rules in `critical_constraint:` at the bottom creates redundant enforcement. The model reads the rule at parse-time (top) and again at generation-time (bottom). Redundancy is not noise here — it is reinforcement.

---

## 8. Prompt Density Awareness

The official Seedance guide recommends 60–100 words for flat-text prompts. Our YAML structure is intentionally denser — it gives director-level control. But density has diminishing returns and can introduce conflicting instructions.

### Guidelines:
- **`camera:` field:** Keep under 20 words. One primary instruction, optionally one secondary.
- **`action:` field:** Can be longer (30–80 words per shot) because choreographic specificity is our competitive advantage. But every sentence must describe a visible movement.
- **`style:` field:** 15–30 words. Tight. Specific references, not stacked adjectives.
- **`visual_feel:` field:** 15–25 words. Rhythm and texture, not specs.
- **`lighting:` per shot:** 5–15 words. Brief and specific.
- **`reference_handling:` field:** Can be longer (30–80 words) — specificity is the entire point.
- **Overall prompt:** Target under 4,000 characters unless otherwise specified.

### The Redundancy Test
Before finalizing, ask: "Does this sentence describe something the model can render in a video frame?" If not, cut it. The model ignores narrative context, emotional subtext, and abstract concepts — those are for the human reading the prompt, not for the model executing it.

**Exception:** `subtext:` and `reference_handling:` are allowed to contain non-renderable information because they serve as directorial guidance for the model's interpretation, not render targets.

---

## 9. Example Prompts

### Example A — Macro Realism (Koi Grillz)

```yaml
title: "Living Grillz — Koi Pond"
reference_handling: "Reference images are for aesthetic anchor only — macro dental photography style. DO NOT reproduce any single frame as the full scene composition."
style: "Hyper-realistic macro photography. 8K dental/jewelry detail, deep cobalt and gold color grading. Wet-surface realism."
visual_feel: "Extreme macro, smooth and slow, shallow depth of field with soft falloff. High-fidelity subsurface scattering on saliva and lips. Specular highlights on gold. All artwork animation stays flat and embedded — painted-on aesthetic, never 3D pop-out."
duration: "15 seconds"

character_modeling:
  mouth:
    base: "Adult mouth, lips slightly parted, matching reference @image1"
    grillz_top: "Gold-bezeled upper grillz. Each tooth is a miniature cloisonné panel: deep cobalt-blue water background with hand-painted koi fish — orange/red koi on the left teeth, white/gold koi on the center and right teeth. Gold wire borders separating each tooth panel."
    grillz_bottom: "Gold-bezeled lower grillz. Each tooth features pink lotus blossoms with green lily pad leaves on a blue-green gradient background. Same cloisonné enamel texture."
    saliva: "Viscous, clear saliva strand connecting upper and lower teeth at center. Catches light with prismatic micro-refraction."

cinematic_storyboard:
  00_03_the_lick:
    camera: "Static extreme macro. Sharp on grillz, soft falloff on lip edges."
    action: "The tongue slowly rises and drags a wet, deliberate lick across the top row of teeth from right to left. Saliva coats the gold bezels and pools at the gum line. The tongue's pressure leaves a glistening wet trail across each koi panel."
    lighting: "Cool blue-dominant with warm gold specular kicks off the bezels."

  03_07_koi_come_alive:
    camera: "Subtle slow push-in, tightening on the upper teeth."
    action: "Triggered by the lick, the painted koi fish begin to move — they stay flat and embedded on the enamel surface like living paintings. The orange koi on the left teeth flick their tails and glide across the blue background. The white koi on the center tooth turns and chases the orange koi. They swim between tooth panels as if the gold bezels are open gates. Tiny painted ripples trail behind each fish."
    lighting: "Specular light catches the physical enamel curvature. Internal mouth cavity dark with rim light on the tongue."
    vfx: "All koi motion is 2D surface animation — like a living ukiyo-e woodblock print. No fish breaks the tooth plane."

  07_11_lotus_sway:
    camera: "Slow tilt down to the lower teeth, maintaining macro scale."
    action: "The lotus blossoms on the bottom grillz begin a gentle organic sway, petals bending softly as if in a warm breeze. The green lily pad leaves ripple at their edges. Two small painted leaves detach from the lower-right tooth and drift downward off the grillz, dissolving into the saliva below like watercolor pigment dispersing in water."
    lighting: "Same cool blue base. Warm gold rim on the lower bezels."
    vfx: "Lotus movement is flat surface animation — petals flex within the enamel plane. The detaching leaves transition from flat texture to semi-dimensional as they leave the tooth, curling slightly before dissolving."

  11_15_full_ecosystem:
    camera: "Gentle pull back to frame the full mouth. Both rows visible. Hold."
    action: "Both rows are now fully alive. Koi fish dart and play across the upper teeth. Lotus flowers pulse with gentle breathing motion on the lowers. The tongue shifts lazily, pressing lightly against the lower teeth. A thick saliva strand stretches and snaps between the rows, catching light. The lips subtly adjust — organic, unconscious mouth movement."
    lighting: "Cool blue ambient with warm gold specular. Dark cavity, rim light on tongue and saliva."

production_notes:
  audio_design: "Wet ASMR: tongue drag, saliva stretch and snap, soft liquid pooling sounds. Faint water ambience underneath — koi pond tone."
  critical_constraint: "All artwork animation must read as living paintings on a physical surface. The teeth remain solid objects with reflections and depth — only the art within them moves."
  avoid: "Jitter, temporal flicker, any 3D pop-out from tooth surfaces."
```

### Example B — Cyberpunk Body Horror (Unraveling)

```yaml
title: "Unraveling"
reference_handling: "CRITICAL: @image1 and @image2 are used STRICTLY for character design — hardware, clothing, skin integration, cable behavior. DO NOT reproduce the reference compositions. The subject is moving through an underground rave and the scene progresses through multiple distinct framings — tracking, whip-pan, pull-back, push-in. Her pose, framing, and blocking are dictated by the storyboard below, not the references."
style: "Dystopian body-horror. Raw, voyeuristic documentary aesthetic meets cyberpunk brutalism. Desaturated cold tones with aggressive red accent lighting. Film grain, anamorphic flares."
visual_feel: "Handheld with natural micro-shake and soft focus drift. Gritty, grainy, unstable. High-fidelity on red cybernetic hardware — glossy automotive-paint sheen, translucent tubing with visible fluid, chrome vertebrae."
duration: "15 seconds"

character_modeling:
  subject:
    back_view: "Female figure matching reference @image1 — exposed red cybernetic exoskeleton along the full spine. Glossy candy-red armored plates with alphanumeric stamping, clear pneumatic tubing carrying luminous blue coolant, chrome mechanical vertebrae. Skin-to-hardware integration is seamless at the edges. Light blue flowing fabric draped loosely from the hips."
    face_reveal: "Matching reference @image2 — porcelain-white synthetic face, half-split down the center seam. Matte white shell exterior, deep red mechanical internals visible through the cranial divide. Dozens of thin red wires and cables trail from connection points across the jaw, temples, and neck. Dark lips, half-lidded eyes, serene expression."
    red_tendrils: "The cables and wires from inside her skull — thin red insulated wire, braided steel cable, flexible red tubing — behave like living whips when released. They move with predatory intelligence, snapping taut before striking."

cinematic_storyboard:
  00_04_the_follow:
    camera: "Handheld tracking shot from behind, slightly below."
    action: "The subject walks with slow, deliberate confidence through a packed underground rave — concrete bunker ceiling, industrial pipe rigging, thick fog from haze machines. Bodies press in on all sides, dancing aggressively. Strobe lights pulse white and violet. Her red cybernetic spine catches every flash — glossy red plates reflect the chaos. Blue coolant pulses through clear tubing in rhythm. Her hips sway, blue fabric trails behind her."
    lighting: "Strobe pulses through dense haze. White and violet flashes. Anamorphic streak flares from overhead."

  04_07_the_turn:
    camera: "Reactive whip-pan around her right side, then settles on her front profile."
    action: "She stops. Turns her head slowly, then her full body follows. The face is revealed: porcelain-white, bisected by a vertical seam crown to chin. Expression calm, almost bored. She raises one hand to her cheek and pinches a single red wire protruding from a port near her jawline. She pulls it. Slowly. Six inches of red cable slides out with a faint mechanical click-click-click. Her eyes lock directly into the camera lens."
    lighting: "Strobes dim to a low drone. Single cool sidelight on her face."

  07_11_the_unraveling:
    camera: "Slow, controlled pull-back. Low angle, looking up."
    action: "She yanks the wire free. Her head splits open along the center seam — the two porcelain halves hinge apart, exposing the dense red mechanical core. Dozens of red wires and cables eject outward from the cranial cavity like a pressurized release, unspooling rapidly. They whip outward with serpentine precision — lashing through the crowd. Each tendril snaps taut on contact, coiling around limbs and torsos. The red cables from her neck and spine join the cascade, her back exoskeleton flowering open as more tendrils deploy."
    lighting: "Strobes accelerate into seizure-flicker. Red hardware catches every flash."
    vfx: "Cable deployment is the spectacle — keep the camera controlled so the action reads clearly. Tendrils move with predatory intelligence."

  11_15_silence:
    camera: "Slow, steady push-in. Low angle, looking up at her."
    action: "The rave is silent. Haze drifts through still air. Bodies scattered motionless on concrete. She stands at center, spine toward camera — red exoskeleton fully expanded, plates fanned open, cables extended in a radial web filling the space. Her head slowly closes along the seam, porcelain halves clicking shut. The last thin wire retracts into her jaw port. She resumes walking into the fog."
    lighting: "Single overhead red practical light. Volumetric fog. Everything else dark."

production_notes:
  audio_design: "00-04: Crushing bass-heavy techno, muffled crowd. 04-07: Music drops to low drone. 07-11: Metallic unspooling, cable-snap impacts, brief shouts cut short. 11-15: Dead silence. One slow drip of condensation on concrete."
  avoid: "Jitter, bent limbs, temporal flicker, chaotic composition during the unraveling — the cables must read as deliberate, not random."
```

### Example C — Stop-Motion Comedy (Matcha Prep)

```yaml
title: "Matcha Prep"
reference_handling: "Reference image is the aesthetic anchor — tactile stop-motion materials, Japanese kitchen, warm lighting. DO NOT reproduce the single frame as the full scene composition. The storyboard below moves through multiple angles — two-shots, close-ups, side tracking, wide reset. Character staging is driven by the storyboard, not the reference."
style: "Handcrafted stop-motion animation. Warm Japanese kitchen aesthetic, Laika Studios quality. Tactile material textures — real clay, real bamboo, real mochi dough. 4K."
visual_feel: "Golden-hour window light, soft bokeh on background. Macro detail on matcha powder granularity and mochi skin texture. Stop-motion holds and pops — no smooth tweening. Matching reference @image1."
duration: "15 seconds"

character_modeling:
  mochi:
    base: "Round white mochi blob sitting in a red-and-black lacquer bowl, matching reference @image1."
    features: "Simple kawaii face — one winking eye, one open eye, rosy pink cheek circles, small confident smirk. Two stubby arm-nubs draped over the bowl rim. Smooth, squishy dough texture with visible subsurface translucency."
    physics: "Jiggles on any contact. Skin dimples under pressure like real mochi. Blush cheeks can intensify from pink to deep red."
  chasen:
    base: "Bamboo matcha whisk (chasen) standing upright beside the matcha powder plate, matching reference @image1."
    features: "Determined face printed on the bamboo handle — sharp angled eyes, cocky open-mouth grin. Black string tied at the waist like a belt. Bristle tips are the 'hair.'"
    physics: "Moves in stiff stop-motion hops. Bristle tips flex and splay on contact."

cinematic_storyboard:
  00_03_the_look:
    camera: "Low tabletop angle, medium two-shot. Hold."
    action: "The chasen hops in place, turning toward the mochi with a slow, deliberate lean. Its eyes narrow. The mochi glances sideways, raises one dough-nub to its mouth, and gives a coy half-smile. A beat of held eye contact."
    lighting: "Warm backlight from shoji window. Soft, even, golden."
    sfx: "Soft wooden clatter of bamboo tapping the table with each hop."

  03_06_the_dip:
    camera: "Close-up on the matcha powder plate. Fixed."
    action: "The chasen tips forward and plunges its bristle head deep into the mound of matcha powder. It swirls slowly — once, twice — coating every bristle tip in vivid green. It lifts out with a dramatic pause, powder cascading off in a fine dust cloud. Bristles fully loaded, bright green and glistening."
    lighting: "Same warm golden ambient. Macro detail catches individual powder particles."
    sfx: "Soft dry rustle of powder displacement. A faint puff as excess falls."

  06_11_the_brush:
    camera: "Medium shot from the side, then gentle tilt down to the mochi's face."
    action: "The chasen hops behind the mochi's bowl and begins brushing its matcha-loaded bristles across the back of the mochi in slow, firm, circular strokes. Green matcha streaks spread across the white dough surface. The mochi's eyes go wide. Mouth opens into a surprised 'O.' Then it starts to giggle — entire body jiggling violently in the bowl with each brush stroke. Blush circles deepen from soft pink to tomato red, spreading across its whole face. It grips the bowl rim tighter, squeezing its eyes shut."
    lighting: "Warm golden, consistent. The green matcha streaks catch the backlight."
    sfx: "Wet bristle-on-dough sounds — soft, rhythmic. Mochi giggles are high-pitched squeaky inhales. Lacquer bowl rattles on wood from the jiggling."

  11_15_the_aftermath:
    camera: "Wide two-shot, returning to the opening frame. Hold."
    action: "The chasen steps back, standing upright with chest puffed out, looking satisfied. Bristles splayed and messy, matcha residue everywhere. The mochi is slumped in the bowl, completely flushed red, green matcha streaked across its back. It peeks one eye open, steam curling off the top of its head. One last tiny jiggle."
    lighting: "Same warm golden. Steam catches the backlight, glowing softly."
    sfx: "A single soft whistle — like a tea kettle — as the steam rises. Then silence."

production_notes:
  audio_design: "No music. All diegetic SFX: wood taps, powder rustle, wet brushing, squeaky giggles, bowl rattle, kettle whistle. Ambient room tone of a quiet Japanese kitchen underneath."
  animation_style: "Stop-motion with intentional micro-jitter between frames. Characters move in holds and pops — no smooth tweening. Material textures must feel tangible and handmade."
  avoid: "Jitter beyond intentional stop-motion cadence, bent limbs on the chasen, identity drift on either character's face."
```

---

## 10. Timestamp Scaling and Pacing

### Duration-to-Shot Scaling

| Duration | Recommended Shots | Avg Seconds Per Shot |
|----------|-------------------|----------------------|
| 5s       | 2–3               | 1.5–2.5s            |
| 10s      | 3–4               | 2.5–3.5s            |
| 15s      | 4–7               | 2–4s (staggered)    |
| 20s      | 5–7               | 2.5–4s              |
| 30s      | 7–10              | 3–4.5s              |

### Stagger Timecodes — Do Not Default to Even Intervals

Do not default to evenly split 3-second intervals. Staggering shot durations based on scene rhythm is required. Even-interval pacing flattens scenes and removes kinetic shape.

Use judgment per beat:
- **Short beats (1–2s):** Impacts, eye-locks, slow-mo flashes, hard cuts, realization moments, cleaver clashes.
- **Medium beats (2.5–3.5s):** Standard action, dialogue, reactions.
- **Longer beats (4–5s):** Sustained action, ritual casts, transformation sequences, magic, dance.

**Good 15-second staggered pacing examples:**
- 0–2s / 2–4s / 4–7s / 7–8s / 8–11s / 11–13s / 13–15s (seven-shot variable rhythm)
- 0–3s / 3–6s / 6–7s / 7–10s / 10–13s / 13–15s (six-shot rhythm with a one-second impact flash)
- 0–2s / 2–5s / 5–6s / 6–9s / 9–12s / 12–15s (six-shot rhythm with impact flash)

### Pacing Principles
- Opening shots can run longer (establishing context).
- Transformation or impact moments should be compressed (1–2s) for energy.
- Final shots benefit from a held beat — let the image breathe before the clip ends.
- Dialogue-driven scenes may use longer shots; action scenes use shorter cuts.
- Slow-motion beats should be brief (1 second) unless the slow-motion IS the scene — extended slow-motion beats deflate clip energy.

---

## 11. Audio Design Patterns

Audio is always specified in production notes, never left to default. Use specific sensory audio keywords — "muffled," "echoing," "crunchy," "reverb," "sharp" — rather than generic descriptors. The model matches audio vibration to these words.

| Genre | Audio Approach |
|-------|---------------|
| Macro / ASMR | Wet textures, contact sounds, amplified material interaction |
| Horror / Cyberpunk | Silence as weapon, sub-bass detonations, metallic impacts |
| Comedy / Dramedy | Ambient room tone, sharp punctuation sounds (pen click, door shut), dialogue pacing |
| Anime / Healing | Soft ambient, wind, water, kitchen sounds, gentle musical stings |
| Action / Fantasy | Layered SFX (impact + reverb + environmental), orchestral swells, bass drops |
| Stop-Motion | Diegetic only, tactile material sounds, no score unless specified |
| Brutal Deity Combat | Distinct vocal signatures for each combatant, wet organic impacts, silence beats as weapon |

---

## 12. Common Critical Constraints

These are recurring rules that may apply depending on the scene type. Include the relevant constraint in `production_notes` → `critical_constraint` when applicable:

- **Surface animation:** "All animation stays flat and embedded on the physical surface — painted-on aesthetic, never 3D pop-out."
- **Handheld realism:** "Camera maintains handheld micro-shake throughout. Never stabilizes to tripod smoothness."
- **Stop-motion cadence:** "Stop-motion with intentional frame-to-frame jitter. No smooth interpolation. Characters move in holds and pops."
- **Material integrity:** "Physical objects maintain real-world reflections, weight, and surface properties even when stylized animation occurs on or within them."
- **No breaking the plane:** "Animated elements within a contained surface (teeth, screen, painting) never extend beyond the physical boundary of that surface."
- **Spatial layout lock (multi-character):** "[Character A] on the LEFT, [Character B] on the RIGHT, facing each other across the [aisle/space] throughout. Neither character crosses behind the other at any point."
- **Reference pose exclusion:** "Reference images are STRICTLY character design anchors. [Character] NEVER shown in the frontal display pose from @image1. [Character] NEVER shown in the forward-charge pose from @image2."

---

## 13. Image-to-Video vs. Text-to-Video Prompting

When generating from a reference image (image-to-video mode), the prompt structure shifts:

| Element | Text-to-Video | Image-to-Video |
|---------|---------------|----------------|
| Subject description | Must be detailed | Already in the image — can be shortened |
| Motion description | Full choreography | Focus on dynamic changes and movement |
| Composition | Describe fully | Add "preserve composition and colors" |
| Camera movement | Flexible | Must align with the image's existing composition |

For image-to-video, front-load with "Animate the provided image" or "Starting from the reference composition" and focus the prompt on what *changes* — not what the image already shows.

---

## 14. Video Reference for Continuation

When a previous clip serves as direct continuation reference (labeled `@video1`), the prompt can open with a `prompt_start:` field BEFORE the `title:` field:

```yaml
prompt_start: "Continue from @video1."
title: "[Scene Title]"
reference_handling: "[...]"
```

This explicit continuation cue helps the model preserve character state, environment, and spatial positioning from the previous clip. Still re-describe everything fully within the character blocks — the model has no memory across generations, so the `prompt_start` cue aids continuity but does not replace full re-establishment.

---

## 15. Multi-Clip Sequence Discipline

When writing a sequence of clips that tell a continuous story:

1. **Every clip must fully re-establish the character, environment, wardrobe, materials, and scene state as if it is the only prompt the model will ever see.** No "same character from Part 1," no "continuation narrative," no "escalated stakes from before."

2. **Carry visible physical damage forward.** Wounds, missing body parts, broken features from previous rounds become part of the character's design in this clip. See Section 7, Rule 5.

3. **Lock spatial relationships across clips.** If two characters face each other across an aisle in clip 3, they face each other across that same aisle in clip 4. State the spatial layout explicitly in `critical_constraint`.

4. **Let each clip end on a hook, not a resolution.** Pre-strike tension, mid-motion cuts, held frames on a reaction — these are stronger clip closers than resolved action. Resolution happens inside the next clip, establishing continuity.

5. **Environmental transformations must be re-described in full.** If clip 3 summoned a new environment, clip 4's character block must describe that environment from scratch as the established setting — not reference that it was summoned previously.
