#!/usr/bin/env bash
# Installation de shootdabih sur un VPS Ubuntu 22.04+ ou Debian 12+ (à lancer en root, ou avec sudo).
# Usage : sudo DOMAIN=jeu.exemple.fr REPO=git@github.com:maknaeq/shootdabih.git bash deploy/setup.sh
# Sans DOMAIN, le script utilise <ip>.sslip.io, une adresse gratuite qui marche avec HTTPS.
set -euo pipefail

REPO="${REPO:-git@github.com:maknaeq/shootdabih.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/shootdabih
APP_USER=shootdabih
PORT=8787

if [ -z "${DOMAIN:-}" ]; then
  IP="$(curl -fsS https://api.ipify.org)"
  DOMAIN="${IP//./-}.sslip.io"
fi
echo "Adresse du jeu : https://$DOMAIN"

apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

# Node.js 24 (NodeSource) et pnpm (corepack)
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@10.30.2 --activate

# Caddy : serveur web avec HTTPS automatique
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# utilisateur dédié et code
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && git fetch && git checkout $BRANCH && git pull --ff-only && pnpm install --frozen-lockfile && pnpm --filter @sdb/client build"

# service systemd
sed "s#__DIR__#$APP_DIR#g; s#__USER__#$APP_USER#g; s#__PORT__#$PORT#g" "$APP_DIR/deploy/shootdabih.service" > /etc/systemd/system/shootdabih.service
systemctl daemon-reload
systemctl enable --now shootdabih
systemctl restart shootdabih

# Caddy en reverse proxy (WebSocket compris)
sed "s#__DOMAIN__#$DOMAIN#g; s#__PORT__#$PORT#g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

# pare-feu
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

sleep 2
curl -fsS "http://127.0.0.1:$PORT/health" && echo " : serveur de jeu OK"
echo "C'est en ligne : https://$DOMAIN (le certificat HTTPS peut prendre une minute la première fois)."
