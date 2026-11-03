# Mettre shootdabih en ligne sur un VPS

Le jeu tient dans un seul processus Node : il sert le site et fait tourner les parties. Caddy, devant, s'occupe du HTTPS (obligatoire pour la webcam et la copie du lien).

## Ce qu'il faut

| | Minimum | Confortable |
|---|---|---|
| Système | Ubuntu 22.04 ou Debian 12 | Ubuntu 24.04 |
| Processeur | 1 vCPU | 2 vCPU |
| Mémoire | 1 Go | 2 Go |
| Disque | 5 Go libres | 10 Go |
| Trafic | environ 20 Go par soirée de 3 h à 12 joueurs | |
| Ports ouverts | 22, 80, 443 | |

Le VPS peut déjà héberger autre chose : le jeu n'utilise que le port 8787 en interne. **Attention** si un autre serveur web (nginx, apache, un autre Caddy) occupe déjà les ports 80 et 443 : voir « Si le VPS a déjà un serveur web » plus bas.

## Mise à jour automatique (CI/CD)

1. À chaque push sur `main`, GitHub Actions (`.github/workflows/ci.yml`) lance le typage, les tests et la compilation.
2. Si tout passe, le commit est publié sur la branche `production`.
3. Sur le VPS, le minuteur `shootdabih-autodeploy` regarde `production` toutes les minutes : s'il y a du nouveau, il récupère, recompile et redémarre le jeu. Un commit qui casse les tests n'est jamais publié.

Le VPS n'a besoin que de la clé de déploiement en lecture seule (déjà ajoutée au dépôt : `vps-shootdabih`). Aucun accès SSH entrant n'est demandé à GitHub.

Suivi : `systemctl list-timers shootdabih-autodeploy`, `journalctl -u shootdabih-autodeploy -n 50`.

## Liste de déploiement

1. **Accès** : se connecter en SSH avec un compte qui a `sudo`.
2. **Accès au dépôt** (privé) : la clé publique `vps-shootdabih` est déjà ajoutée en lecture seule sur GitHub. Il faut que la clé privée correspondante soit utilisable par l'utilisateur `shootdabih` :
   ```bash
   sudo useradd --system --create-home --shell /usr/sbin/nologin shootdabih   # si pas encore créé
   sudo mkdir -p /home/shootdabih/.ssh
   sudo cp ~/.ssh/<clé privée vps-shootdabih> /home/shootdabih/.ssh/id_ed25519
   sudo ssh-keyscan github.com | sudo tee /home/shootdabih/.ssh/known_hosts
   sudo chown -R shootdabih:shootdabih /home/shootdabih/.ssh && sudo chmod 600 /home/shootdabih/.ssh/id_ed25519
   sudo -u shootdabih ssh -T git@github.com   # doit répondre « successfully authenticated »
   ```
3. **Adresse** (au choix) :
   - sans nom de domaine : rien à faire, le script utilise `<ip>.sslip.io` (gratuit, HTTPS automatique) ;
   - avec un nom de domaine : créer un enregistrement DNS `A` vers l'IP du VPS, puis passer `DOMAIN=jeu.exemple.fr`.
4. **Installer** :
   ```bash
   sudo -u shootdabih git clone --branch production git@github.com:maknaeq/shootdabih.git /tmp/sdb-setup
   sudo DOMAIN=jeu.exemple.fr bash /tmp/sdb-setup/deploy/setup.sh
   ```
   Le script installe Node 24, pnpm, Caddy, crée l'utilisateur `shootdabih`, compile le site, crée le service `shootdabih`, configure Caddy et le pare-feu.
5. **Vérifier** : ouvrir `https://<adresse>`, créer un salon, rejoindre depuis un autre appareil.
6. **Mises à jour** : automatiques après chaque push qui passe la CI. À la main si besoin : `sudo bash /opt/shootdabih/deploy/autodeploy.sh`.

## Commandes utiles

| Besoin | Commande |
|---|---|
| État du serveur | `systemctl status shootdabih` |
| Journal en direct | `journalctl -u shootdabih -f` |
| Redémarrer | `sudo systemctl restart shootdabih` |
| Santé | `curl http://127.0.0.1:8787/health` |
| Logs HTTPS | `journalctl -u caddy -f` |

## Si le VPS a déjà un serveur web

Ne pas lancer la partie Caddy du script (commenter le bloc « Caddy » et le `ufw`), et ajouter au serveur existant un proxy vers `127.0.0.1:8787` **avec WebSocket** :

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

## Ce qui n'est pas encore géré

- Les comptes, les points et la boutique (base Supabase à créer).
- Une seule machine : si le VPS redémarre, les parties en cours sont perdues (le service, lui, redémarre seul).
