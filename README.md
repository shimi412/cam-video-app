# CAM Video App

Local development of CAM's video production tool. Read `BLUEPRINT.md` before changes and the relevant Next.js documentation in `node_modules/next/dist/docs/` before changing pages or routes. The framework rules live in `AGENTS.md`.

## Safe local workflow

```bash
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:seed
pnpm dev:preview
```

`dev:preview` binds to localhost and forces offline media and brain providers, even if `.env` contains production credentials. Simulation never writes a credit consumption or refund. Its hypothetical costs are stored separately in API-call metadata and `jobs.params.simulatedBilledUsd`.

The old five styles are archived in the database and the source catalogue. They remain available to the explicit offline CLI below for regression checks. The client library and new-production endpoints do not offer them. Until the first new CAM recipe is integrated, the Studio displays a preparation message and disables production.

## Verification

```bash
pnpm test
pnpm lint
PROVIDER_MODE=dryrun BRAIN_MODE=mock pnpm build
pnpm check:providers
```

Provider diagnostics perform an Anthropic model lookup, upload one dummy byte to fal storage, and optionally read Runway's organization endpoint. They do not generate text, images, audio or video. Failure exits nonzero. Passing only proves the specific access checked, not sufficient credits, inference availability or media quality.

Offline end-to-end regression, with PostgreSQL running and recipes seeded:

```bash
pnpm dryrun cartoon-ink-noir 9:16 <<'SCRIPT'
A book opens. The pages reveal the full context. Read the whole passage before sharing a claim.
SCRIPT
```

This blocks Node fetch, submits the same job twice concurrently, renders a placeholder MP4 and writes a production sheet. It fails if the job fails, makes an external fetch, renders twice, records real expenses or writes any ledger entry. This is a technical regression check, not a CAM visual-quality demonstration. The retired collage renderer still loads its animation library externally; its offline rendering will be replaced with the concept engine.

## Production mode

`PROVIDER_MODE=fal` enables real media adapters. `BRAIN_MODE=api` enables the Anthropic brain in real mode. `VIDEO_PROVIDER=runway` changes only the video adapter. Keep secrets in the gitignored `.env` file; `.env.example` lists the configuration.

A paid test still requires Shimon's approval of its script, style, voice and estimated budget. No paid generation is part of the development checks above.

A production snapshots its execution mode. Confirmation and execution refuse a mode change, archived styles cannot be confirmed, and duplicate confirmations/executions are claimed atomically. The successful job update and the credit debit share one transaction. Durable resumption, budget reservations between different jobs, price caps and complete provider metering remain work for the concept engine.
