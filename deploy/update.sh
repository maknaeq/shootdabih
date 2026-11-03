#!/usr/bin/env bash
# Mise à jour du jeu sur le VPS : récupère le code, recompile, redémarre. Usage : sudo bash /opt/shootdabih/deploy/update.sh
set -euo pipefail
APP_DIR=/opt/shootdabih
sudo -u shootdabih bash -c "cd $APP_DIR && git pull --ff-only && pnpm install --frozen-lockfile && pnpm --filter @sdb/client build"
systemctl restart shootdabih
sleep 2 && curl -fsS http://127.0.0.1:8787/health && echo " : serveur relancé"
