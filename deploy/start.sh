#!/bin/sh
set -eu
# Fixed first-release boundary, checked before database writes or serving requests.
node --import tsx -e 'import("./src/lib/release-policy.ts").then(m => { const e = (m.releaseConfigErrors ?? m.default.releaseConfigErrors)(process.env); if(e.length) { console.error(e.join("\n")); process.exit(1); } })'
node --import tsx scripts/migrate.ts
node --import tsx scripts/seed.ts
node --import tsx scripts/check-installation.ts
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
