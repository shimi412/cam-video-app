#!/bin/sh
# Restores only to an empty, separately named Compose installation.
set -eu
umask 077
snapshot=${1:?Usage: sh deploy/restore.sh BACKUP_DIRECTORY NEW_PROJECT_NAME}
project=${2:?Use a new Compose project name}
case "$project" in cam-restore-*) ;; *) echo 'Restore project name must start with cam-restore-.' >&2; exit 1;; esac
case "$project" in *[!a-z0-9-]*) echo 'Invalid project name.' >&2; exit 1;; esac
dc() { docker compose --env-file .env.deploy -p "$project" -f deploy/compose.yaml "$@"; }
node scripts/backup-manifest.mjs verify "$snapshot"
test -z "$(dc ps --status running -q app)" || { echo 'The restore app must be stopped.' >&2; exit 1; }
dc up -d --wait db
tables=$(dc exec -T db psql -U cam -d cam -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
test "$tables" = 0 || { echo 'Refusing to replace a non-empty database. Use a new project.' >&2; exit 1; }
dc run --rm --no-deps --entrypoint sh app -c 'test -z "$(ls -A /app/storage)"' || { echo 'Refusing to replace existing media.' >&2; exit 1; }
dc exec -T db pg_restore -U cam -d cam --single-transaction --no-owner --no-acl < "$snapshot/database.dump"
dc run --rm --no-deps -T --entrypoint tar app -C /app/storage -xzf - < "$snapshot/media.tar.gz"
echo "Restored into $project. No public server started. Review the data, configure its domain and run the installation check before cutover."
