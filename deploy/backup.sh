#!/bin/sh
# Run from the repository root on the dedicated CAM host. Never copies .env files.
set -eu
umask 077
dc() { docker compose --env-file .env.deploy -f deploy/compose.yaml "$@"; }
test -f .env.deploy
test "$(dc ps --status running -q app | wc -l | tr -d ' ')" = 1 || { echo 'The CAM app must be running before backup.' >&2; exit 1; }
test "$(dc ps --status running -q caddy | wc -l | tr -d ' ')" = 1 || { echo 'The CAM proxy must be running before backup.' >&2; exit 1; }
snapshot=".backups/cam-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p .backups
mkdir "$snapshot"
# Block new requests, then require an idle runner for a consistent DB/media pair.
dc stop caddy
trap 'dc start app caddy >/dev/null' EXIT
active=$(dc exec -T db psql -U cam -d cam -Atc "SELECT count(*) FROM jobs WHERE status IN ('running','confirmed') OR params->'formatExports'->>'status' IN ('running','queued')")
test "$active" = 0 || { echo 'A production is active or interrupted. Finish/recover it before backup.' >&2; exit 1; }
dc stop app
dc exec -T db pg_dump -U cam -d cam --format=custom --no-owner --no-acl > "$snapshot/database.dump"
dc run --rm --no-deps --entrypoint tar app -C /app/storage -czf - . > "$snapshot/media.tar.gz"
node scripts/backup-manifest.mjs create "$snapshot"
echo "Backup complete: $snapshot. Keep an encrypted copy on a separate disk before delivery."
