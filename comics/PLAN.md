# Attack integration plan, 2026-10-19

Status: integrated locally; offline end-to-end acceptance passed on 2026-10-19. Shimi’s visual acceptance remains pending. No customer production or paid generation was used for verification.

## Decisions

1. Add an independent `/comics/new` and `/comics/[id]` category beside Clay and Motion. Store its versioned state in `comics_runs`, with existing authentication, wallet and durable request receipts. Preserve the existing categories and their accepted requests.
2. Claude uses the per-video agent session and the approved comics method to produce a typed panel plan. Preserve every spoken word and its order. Meaningful phrases determine panels, not a word-count algorithm. Validate hero appearances at no more than floor(panel count / 3), full body at most once. Prompt templates enforce locked references, flat 2D style and no generated lettering.
3. Show preparation price before Start; key-image storyboard with per-panel Yes/No, scope-specific and global locked feedback; Apply all feedback prepares one price before spending. Approve the exact storyboard, then the video quote. Assemble all clips before visual approval. Keep finishing notes for the separate sound/editing/subtitles review and bind download to the exact approved file.
4. Default to Harrison. Any requested voice comparison requires a separate priced offer; it must never trigger speculative samples. No provider identity is exposed in the client UI.
5. Preserve original media and inspect generated panels/clips. Flag borders, lettering, wrong emblems and invented actions before presentation. A failed check blocks the stage with a specific reason. Use the exact local CAM emblem; permit explicitly reviewed camera-only fallback for emblem distortion. Never silently label an uninspected asset correct.
6. Journal supplier requests and completed media by operation; distinguish quoted provider estimates from measured Claude usage and any returned supplier receipts. Price cumulative estimated cost using adaptive-v1, rounded upward to whole dollars, deducting prior accepted amounts. Retain receipts and approval identities on restart; an ambiguous submission never becomes a fresh request.

## Work order and evidence

- Finish and verify the persistent agent + shared-memory foundation.
- Implement comics plan, pricing, durable orchestration and provider adapters behind explicit approval gates.
- Adapt the reference comic-page/camera/title/logo machinery to arbitrary plans and word timings, with local rendering and blocking quality checks.
- Add client pages and authenticated media routes.
- Exercise the complete real UI/controller/render path against a disposable database with injected reference media and all external generation disabled.
- Run unit tests, lint, Clay and Motion journeys after integration stages; add Attack journey and failure/restart tests. Record exact evidence and remaining human visual acceptance in ACCEPTANCE-fr.md and MEMORY.md.

## Risks to test

- The reference build contains hard-coded Gazalighting wording and timings; those must not leak into another script.
- The old flash detector scans only eight frames at 30 fps despite its 0.8-second description. The integrated detector must cover the full 24-frame window and retain evidence for review.
- Generated media is nondeterministic. Offline tests prove orchestration and reference-based rendering, not future provider quality.
- Preparing the storyboard also spends money. Start must carry an explicit preparation-price acceptance; no hidden reasoning or media retries.
- A database restart, browser closure or duplicate click must preserve exact request identities, locked feedback and completed scenes.
- Shared CAM memory contains only approved project guidance. Private ALEF context and another video's raw messages stay inaccessible.
