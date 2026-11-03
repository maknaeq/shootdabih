#!/usr/bin/env bash
# Lancé toutes les minutes par le minuteur systemd shootdabih-autodeploy.
# Si la branche production a bougé (commit testé par la CI), met le jeu à jour et le redémarre.
set -euo pipefail
APP_DIR=/opt/shootdabih
APP_USER=shootdabih
BRANCH="${BRANCH:-production}"
cd "$APP_DIR"
sudo -u "$APP_USER" git fetch --quiet origin "$BRANCH"
LOCAL="$(sudo -u "$APP_USER" git rev-parse HEAD)"
REMOTE="$(sudo -u "$APP_USER" git rev-parse "origin/$BRANCH")"
[ "$LOCAL" = "$REMOTE" ] && exit 0
echo "Mise à jour $LOCAL -> $REMOTE"
sudo -u "$APP_USER" bash -c "git checkout --quiet -B $BRANCH origin/$BRANCH && pnpm install --frozen-lockfile && pnpm --filter @sdb/client build"
systemctl restart shootdabih
sleep 2
curl -fsS http://127.0.0.1:8787/health >/dev/null && echo "Jeu relancé sur $REMOTE"
