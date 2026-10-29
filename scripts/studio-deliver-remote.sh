#!/bin/bash
# Deliver a studio version produced on the Mac to the CAM site on the VPS (2026-10-26).
#   scripts/studio-deliver-remote.sh <missionId> <film.mp4> [notes.md]
# Copies the film and the notes to the server, then runs studio-deliver.ts there (DB and storage of the server).
set -euo pipefail
MISSION="$1"; FILM="$2"; NOTES="${3:-}"
HOST="${CAM_SERVER:-mon-serveur}"; APP=/srv/cam-video-app/app; NODE=/usr/bin/node
TMP="/tmp/cam-deliver-$MISSION"
ssh "$HOST" "mkdir -p $TMP && chmod 777 $TMP"
scp -q "$FILM" "$HOST:$TMP/final.mp4"
if [ -n "$NOTES" ]; then scp -q "$NOTES" "$HOST:$TMP/notes.md"; fi
ssh "$HOST" "sudo -u cam bash -lc 'cd $APP && $NODE node_modules/tsx/dist/cli.mjs --env-file=.env scripts/studio-deliver.ts $MISSION $TMP/final.mp4 ${NOTES:+$TMP/notes.md}'; rm -rf $TMP"
