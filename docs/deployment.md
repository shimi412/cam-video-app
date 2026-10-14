# CAM preview release: installation and recovery

This package is the first **preview workspace**, with invited accounts, saved conversations and campaigns, imported-media assembly, recovery and three-format downloads. Media and text generation remain offline. New Bram recordings, live payments and the other CAM recipes are not enabled.

## Verification status

The fresh PostgreSQL installation, repeatable migrations, zero initial balance and rollback on a failed migration are tested locally by `pnpm test:installation`. `pnpm test:access:production` checks real credentials and sessions against `next start`. `pnpm test:exports` actually renders files and checks their format, preserved audio, recovery and corruption detection.

**The Docker stack, TLS and backup/restore commands still need an on-host rehearsal.** Docker is not installed on the development Mac. A local test cannot certify the dedicated CAM server. No server has been purchased or deployed by this work. Do not call this release publicly deployed until the acceptance steps below pass.

## Prepare the dedicated CAM host

Use a dedicated CAM environment, not the BINA server. Install Docker Engine with Compose v2 and Node.js 22 for the operator scripts. Allocate persistent disk for the growing video library. Render capacity and the under-30-minute target must be measured on this host before acceptance.

Place the source in a private directory. Configure a CAM domain pointing to this host; allow inbound 80/443. App and PostgreSQL ports remain unpublished. Keep one app instance: media and render checkpoints live on its shared local volume.

```bash
pnpm install --frozen-lockfile
pnpm release:configure cam.your-domain.example
```

For a host without dependencies yet, use `pnpm install --frozen-lockfile` (pnpm 11.17.0), then `pnpm release:configure cam.your-domain.example`. This writes fresh database and session secrets to mode-600 `.env.deploy`, exclusively. It refuses to overwrite working credentials. It does not create a domain, rent a server, start services or configure paid providers. Store a separate encrypted copy of this file with the authorized operator; it is deliberately excluded from media/database backups.

```bash
docker compose --env-file .env.deploy -f deploy/compose.yaml build
docker compose --env-file .env.deploy -f deploy/compose.yaml up -d
docker compose --env-file .env.deploy -f deploy/compose.yaml exec app node --import tsx scripts/check-installation.ts
```

The app waits for PostgreSQL health, applies checksummed migrations and seeds recipes without granting any credits. Startup refuses a live provider, an AI brain, a local authentication bypass or an invalid origin/secret. The image includes FFmpeg and Chromium. Mac test voices are unavailable on Linux: use imported recordings, silence or the historical media pack. Public catalogue voice samples load only when played.

The dependency order follows [Docker Compose startup conditions](https://docs.docker.com/compose/how-tos/startup-order/). HTTPS terminates at Caddy; the app receives requests through its [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). The Next.js app runs as an unprivileged user through `next start`, with a persistent media volume and a 35-minute stop allowance for renders. Preview requests can still be recovered after a forced shutdown. No provider key enters the image or Compose environment.

## First account

```bash
docker compose --env-file .env.deploy -f deploy/compose.yaml exec app node --import tsx scripts/bootstrap-admin.ts administrator@example.org
docker compose --env-file .env.deploy -f deploy/compose.yaml exec app cat .secrets/bootstrap-invitation.txt
```

Read the one-use link privately and open it within 48 hours. Choose a name/password and sign in. Then use **Admin → Manage workspace access** to invite the actual CAM users. Share invitations only with their intended recipients through an authorized channel; no email is sent automatically. Remove the bootstrap file after acceptance. All invited clients share this dedicated CAM workspace; this is not a multi-tenant service.

## Optional historical media pack

The source image includes the character references. The separate `cam-example-media.tar.gz` contains only the 15 hash-checked source files for the historical Clay film, including **Dylan**, not a new Bram reading. Extract it into the app media volume before loading the example:

```bash
docker compose --env-file .env.deploy -f deploy/compose.yaml run --rm --no-deps -T --entrypoint tar app -C /app/storage -xzf - < cam-example-media.tar.gz
docker compose --env-file .env.deploy -f deploy/compose.yaml exec app node --import tsx scripts/check-installation.ts
```

Use the supplied manifest to verify the archive before extraction. Do not import the full development database or its test history: saved absolute media paths from the Mac are not a portable production restore. Server backups preserve the stable `/app/storage` path instead.

## Backup and restore

```bash
sh deploy/backup.sh
node scripts/backup-manifest.mjs verify .backups/cam-TIMESTAMP
```

The command requires the app and proxy to be running, briefly stops the proxy to block new requests, refuses an active/queued job, then stops the idle app while taking a PostgreSQL dump and media archive. It restarts the services on exit. A manifest appears only when both files are non-empty; each has a SHA-256 digest. Partial directories without a valid manifest are not backups. The configuration and invitation secrets are excluded. Copy the verified backup to a separate encrypted disk or already-authorized backup service. No remote transfer, retention deletion or scheduled automation is configured here.

Test a restoration before handing over the server, and after changing the backup process:

```bash
sh deploy/restore.sh .backups/cam-TIMESTAMP cam-restore-rehearsal
```

This verifies both digests and restores only into an empty, separately named Compose installation. It refuses any existing database tables or media. It starts PostgreSQL only and does not expose the restored app. Inspect it on an isolated host or temporary private domain before cutover; never start a second Caddy on occupied ports. If a partial restore fails, use a new restore project; do not overwrite live data. Preserve the corresponding `.env.deploy` and source/image version. Revoke old sessions if recovering from compromised credentials.

## Server acceptance before sending access

- Run `check-installation` successfully and accept the real administrator invitation.
- Sign in as a client: see the shared workspace; deny Admin and anonymous media access.
- Create a conversation, attach a reference and prepare the exact narration in Studio.
- Import/review a recording and scenes or rebuild the historical example. Watch the result end to end.
- Prepare all three downloads; check duration, audible voice, caption placement and pictures in each. New previews adapt text layout. Historical films are fitted within other canvases without cropping their existing titles.
- Reload the saved result, seek in the video and download MP4, audio and subtitles.
- Interrupt a disposable render and recover it. No client credits or provider requests should appear.
- Take and restore a backup into a separate installation. Confirm login, notes, references and video playback after restore.
- Record host render time, free disk, image version and the backup operator. Show CAM the in-app Help guide and state the remaining Bram/live-generation limitations.

These are acceptance checks, not permission to buy credits, begin a trial or open paid generation.
