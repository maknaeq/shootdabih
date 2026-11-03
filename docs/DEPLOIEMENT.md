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

## Liste de déploiement

1. **Accès** : se connecter en SSH avec un compte qui a `sudo`.
2. **Accès au dépôt** (privé) : sur le VPS, créer une clé et l'ajouter comme *deploy key* en lecture seule sur GitHub.
   ```bash
   sudo -u root ssh-keygen -t ed25519 -f /root/.ssh/shootdabih -N ""
   cat /root/.ssh/shootdabih.pub   # à coller dans GitHub > maknaeq/shootdabih > Settings > Deploy keys
   printf "Host github.com\n  IdentityFile /root/.ssh/shootdabih\n" | sudo tee -a /root/.ssh/config
   ```
   Le script clone en root puis donne le dossier à l'utilisateur `shootdabih` ; pour les mises à jour, copier aussi la clé dans `/home/shootdabih/.ssh/` (ou passer le dépôt en public).
3. **Adresse** (au choix) :
   - sans nom de domaine : rien à faire, le script utilise `<ip>.sslip.io` (gratuit, HTTPS automatique) ;
   - avec un nom de domaine : créer un enregistrement DNS `A` vers l'IP du VPS, puis passer `DOMAIN=jeu.exemple.fr`.
4. **Installer** :
   ```bash
   curl -fsSL https://raw.githubusercontent.com/maknaeq/shootdabih/main/deploy/setup.sh -o setup.sh   # si le dépôt est public
   # sinon : cloner le dépôt une fois à la main, puis lancer le script depuis le clone
   sudo DOMAIN=jeu.exemple.fr bash setup.sh
   ```
   Le script installe Node 24, pnpm, Caddy, crée l'utilisateur `shootdabih`, compile le site, crée le service `shootdabih`, configure Caddy et le pare-feu.
5. **Vérifier** : ouvrir `https://<adresse>`, créer un salon, rejoindre depuis un autre appareil.
6. **Mettre à jour** plus tard : `sudo bash /opt/shootdabih/deploy/update.sh`.

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
