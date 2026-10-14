#!/bin/bash
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null || [ ! -f node_modules/tsx/dist/cli.mjs ]; then
  echo "Le dossier CAM ou Node.js est absent. Rouvrir le projet avec Codex."
  read -r -p "Appuyer sur Entrée pour fermer. "
  exit 1
fi
if ! node node_modules/tsx/dist/cli.mjs scripts/local-demo.ts; then
  echo "Le démarrage a échoué. Les dossiers enregistrés sont conservés."
  read -r -p "Appuyer sur Entrée pour fermer. "
  exit 1
fi
