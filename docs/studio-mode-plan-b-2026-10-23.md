# Studio mode (plan B), design of 2026-10-23

Decision of Shimi (2026-10-23): a fulfilment mode where the client uses the same screens, but the versions are produced by Shimi on his machine (with Claude Code) and uploaded through an admin page. The client journey is the single journey decided the same day: script, estimate (delay and price), approval, V1, feedback, V2 quote, ..., approval of a version, download. The client-facing copy stays neutral ("your video is in production", "your video is ready") and never claims automatic generation.

## Admin setting

`settings.fulfilment` = `{ clay: "engine" | "studio", motion: "engine" | "studio", comics: "engine" | "studio" }` (default `engine` for all). Switchable per category in /admin.

## Data

Table `studio_missions` (one row per client version request):
- `id`, `job_id`, `category`, `version` (1, 2, ...), `script`, `feedback` (the locked notes for this version, empty for V1), `price_cents` (what the client approved), `state` (`queued` | `in-production` | `delivered`), `created_at`, `delivered_at`, `media_path` (the uploaded film), `notes` (Shimi's notes shown to the client as review notes, optional).

## Client flow (studio)

1. Start: same creation screen. Estimate = the grid (first version by tiers of an estimated cost; in studio mode the cost estimate uses the same calculators as the engine so the price is identical), delay shown as "within 24 hours" (admin-configurable text).
2. After approval: the job enters `queued`, the client sees "In production" with the delay. A notification goes to Shimi (Telegram @EmilioClaudeBot, fallback e-mail) with the title, category, script, approved price and the admin link.
3. Admin page `/admin/studio`: list of missions; for each, the script and feedback, a file input for the film (mp4 vertical), optional notes; "Deliver version". The upload is hash-verified and stored under `storage/studio/<job>/v<N>.mp4`; the client's job moves to "version ready".
4. Client review: the same V1 review screen as the engine (video, feedback box). "Apply feedback" creates the next mission with the locked notes and shows a revision quote = revisionPriceCents(estimated additional cost; in studio mode the admin sets a default per-revision cost, e.g. $1.50 -> $3). Approval -> `queued` again -> notification.
5. "Approve this version" -> wallet settlement (existing) -> download (existing media route).

## Engine fallback

A studio job can be handed to the engine later only as a new job; a mission is never silently converted.

## Out of scope for the first delivery

Automatic formats (three exports), finishing options, per-scene feedback. Everything the client types is forwarded verbatim to Shimi.

## Wiring of 2026-10-26 (Attack first; Shimi's decision: the software is a screen between Claude Code and the client)

Implemented for `comics` only; Clay and Motion keep the engine whatever the setting says.

- Switch: `/admin/studio`, section "Fulfilment per category" (`GET/POST /api/admin/studio/fulfilment`). `settings.fulfilment` is validated by the `Fulfilment` schema of `src/lib/studio/missions.ts`.
- The film carries `fulfilment: "studio"` and `panelCount` from its creation; a later switch never changes it.
- Estimate: local, `src/lib/studio/pricing.ts` (constants) and `priceStudioComic` (`src/lib/comics/pricing.ts`). Delay = `estimatedMinutes(panelCount)` (the "within 24 hours" text of this plan is not implemented: the task of 2026-10-26 keeps the existing delay).
- Approval -> `createMission` (V1) with the credits reserved; feedback -> revision quote (`CAM_STUDIO_REVISION_COST_USD` 1.5 -> $3) -> approval -> `createMission` (V2 with the locked notes as `feedback`).
- Delivery -> `applyStudioDelivery(missionId)` -> the client reviews the delivered file; approval -> settlement -> download of that file.

What the executor reads (`studio_missions` row, `StudioMission`): `id`, `jobId`, `category` (`comics`), `version` (1, 2, ...), `title`, `script`, `feedback` (`[{text, scene?, seconds?}]`, empty for V1), `priceCents` (the approved additional price of this version), `state` (`queued` | `in-production` | `delivered`), `mediaPath`, `mediaSha256`, `notes`, `createdAt`, `deliveredAt`.

What the executor calls to deliver: `deliverMission(missionId, {bytes, contentType: "video/mp4"}, notes)` then `applyStudioDelivery(missionId)` (`scripts/studio-deliver.ts` does both).
