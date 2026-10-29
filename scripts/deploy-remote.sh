#!/bin/bash
# Deploy the CAM site to the Bina VPS (2026-10-28). One command, the only supported way to update the server.
#   scripts/deploy-remote.sh
# 1. rsync the repo (no node_modules, .next, storage, .env, .secrets, .git, .venv-motion-runtime: the Mac venv broke the
#    Turbopack build on 2026-10-28), 2. copy into /srv/cam-video-app/app as cam, 3. build with the storage link set
#    aside (Turbopack panics on any file under the storage symlink: "points out of the filesystem root", live outage
#    2026-10-28 18:10), 4. restore the link, restart the service and check the public login page.
set -euo pipefail
HOST="${CAM_SERVER:-mon-serveur}"; APP=/srv/cam-video-app/app; NODE=/usr/bin/node
cd "$(dirname "$0")/.."
rsync -az --delete --exclude node_modules --exclude .next --exclude storage --exclude .env --exclude .secrets --exclude .git --exclude ".venv*" ./ "$HOST:/tmp/cam-app-sync/"
ssh "$HOST" "set -e
sudo rsync -a --delete --exclude .env --exclude .secrets --exclude storage --exclude node_modules --exclude .next --exclude ".venv*" /tmp/cam-app-sync/ $APP/
sudo chown -R cam:cam $APP
cd $APP
sudo mv storage storage.volume
set +e; sudo -u cam $NODE node_modules/next/dist/bin/next build > /srv/cam-video-app/build-last.log 2>&1; R=\$?; set -e
sudo mv storage.volume storage
if [ \$R -ne 0 ]; then echo 'BUILD FAILED, service untouched'; tail -20 /srv/cam-video-app/build-last.log; exit 1; fi
sudo systemctl restart cam-video-app; sleep 6; systemctl is-active cam-video-app
curl -s -o /dev/null -w 'public login %{http_code}\n' https://cam.bina-cloud.com/login"
