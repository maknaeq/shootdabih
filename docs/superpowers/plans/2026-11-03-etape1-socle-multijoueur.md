# Étape 1 : socle multijoueur, plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** une partie deathmatch jouable à plusieurs dans le navigateur : on crée un salon, on partage le lien, on court, on saute, on dash, on tire au rayon, premier à 25 gagne, sur une map provisoire « Camp de base » en DA diorama plat.

**Architecture :** monorepo pnpm avec trois paquets. `shared` contient tout ce qui doit être identique côté client et serveur (réglages, format de map, collisions, physique du joueur, tir, règle de spawn, protocole). Le serveur Node fait foi et simule à 60 pas/s, envoie l'état à 30 Hz par WebSocket. Le client Vite + Three.js prédit son propre joueur, interpole les autres et dessine la scène.

**Tech stack :** TypeScript 5, pnpm workspaces, Vitest, Node 24 + `ws`, Vite 6, Three.js r170.

Spec de référence : `docs/superpowers/specs/2026-11-03-shootdabih-design.md`.

---

## Carte des fichiers

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, vitest.workspace.ts
packages/shared/src/
  config.ts        réglages de jeu (vitesses, recharges, score cible…)
  vec.ts           petites fonctions de vecteurs 3D
  map/types.ts     types MapDef / MapData (Box, Ramp, Pad, Spawn, Lamp, Mood)
  map/builder.ts   outils de construction (block, slab, ramp, floor percé, room, grid, pad, spawn)
  map/collision.ts surfaceAt, groundAt, hitsWall, ceilingAt, segmentBlocked
  maps/camp.ts     map provisoire « Camp de base »
  maps/index.ts    registre des maps
  physics.ts       état joueur + stepPlayer(state, input, map)
  shot.ts          rayCapsule(), traceShot() (mur le plus proche, joueur touché)
  spawn.ts         chooseSpawn() : règle validée
  protocol.ts      messages client ↔ serveur (types + encode/decode JSON)
  index.ts         exports
packages/shared/test/*.test.ts
apps/server/src/
  room.ts          salon : joueurs, boucle, historique pour le tir, scores, fin de partie
  rooms.ts         registre des salons, codes, nettoyage
  http.ts          serveur HTTP + WebSocket (création, connexion, santé)
  index.ts         démarrage
apps/server/test/room.test.ts
apps/client/
  index.html
  src/main.ts            routage accueil / salon
  src/ui/home.ts         pseudo + « Créer un salon »
  src/ui/lobby.ts        salle d'attente, lien à copier, bouton Lancer
  src/ui/hud.ts          viseur, recharge, dash, score, éliminations
  src/ui/scoreboard.ts   tableau Tab et fin de partie
  src/ui/style.css
  src/net/connection.ts  WebSocket, réveil du serveur, reconnexion
  src/game/input.ts      clavier, souris, capture du pointeur
  src/game/predict.ts    prédiction et recalage du joueur local
  src/game/interp.ts     interpolation des autres joueurs
  src/game/session.ts    relie réseau, entrées, rendu
  src/render/renderer.ts scène Three, lumières, ombres, ambiance
  src/render/world.ts    géométrie de la map (fusion par matériau)
  src/render/avatar.ts   personnage en parka
  src/render/viewmodel.ts bras + arme
  src/render/effects.ts  rayon, éclats, marque de touche
```

## Tâches

### Tâche 1 : monorepo
- [ ] `package.json` racine (scripts `dev`, `test`, `build`, `typecheck`), `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `tsconfig.base.json` (strict, ES2022, moduleResolution bundler).
- [ ] Paquets `@sdb/shared`, `@sdb/server`, `@sdb/client` avec leurs `package.json` et `tsconfig.json`.
- [ ] `pnpm install`, `pnpm -r typecheck` passe sur des fichiers vides.
- [ ] Commit « Monorepo pnpm ».

### Tâche 2 : réglages et vecteurs
- [ ] `config.ts` exporte `CONFIG` avec : `tickRate 60`, `snapshotRate 30`, `runSpeed 9`, `jumpSpeed 9.5`, `gravity 22`, `dashSpeed 18`, `dashTime .22`, `dashCooldown 2`, `fireCooldown 1.2`, `respawnDelay 1`, `scoreToWin 25`, `matchMaxSeconds 600`, `maxPlayers 12`, `playerRadius .3`, `playerHeight 1.75`, `eyeHeight 1.6`, `stepHeight .55`, `hitRadius .45`, `maxRewindMs 200`, `interpDelayMs 100`, `groundAccel 14`, `airAccel 3.5`.
- [ ] `vec.ts` : `Vec3 = {x,y,z}`, `v3()`, `add`, `sub`, `scale`, `len`, `norm`, `dot`, `forwardFromAngles(yaw, pitch)` avec la convention : yaw 0 regarde vers −z.
- [ ] Test : `forwardFromAngles(0,0)` ≈ `{0,0,-1}`, `forwardFromAngles(Math.PI/2,0)` ≈ `{-1,0,0}`, `forwardFromAngles(0,Math.PI/2)` ≈ `{0,1,0}`.

### Tâche 3 : format de map et outils de construction
- [ ] `map/types.ts` :
  - `Box {x0,x1,y0,y1,z0,z1,mat}` ; `Ramp {x0,x1,z0,z1,h0,h1,axis:'x'|'z',mat}` ; `Pad {x,y,z,vx,vy,vz}` ; `Spawn {x,y,z}` ; `Lamp {x,y,z}` ; `Mood {sky, fog, fogNear, fogFar, hemiSky, hemiGround, hemiIntensity, sun, sunIntensity, sunDir:[x,y,z], lamp}` ;
  - `MapDef {id, name, size:[w,d], players:[min,max], mood, build(b: Builder): void}` ;
  - `MapData {def, boxes, ramps, pads, spawns, lamps}`.
- [ ] `map/builder.ts` : `createBuilder()` qui accumule les éléments et expose `block(x,z,w,d,y0,y1,mat)`, `slab(x,z,w,d,y,mat)` (épaisseur 0,4 sous `y`), `ramp(...)`, `floor(x,z,w,d,y,mat,holes)`, `room(x,z,w,d,y0,y1,mat,openings)`, `grid(...)`, `walls(w,d,h,mat)`, `pad(x,z,vx,vy,vz)` (hauteur calculée sur le sol déjà posé), `spawn(x,y,z)` (+0,5 sur x et z), `lamp(x,y,z)`. `buildMap(def): MapData`.
- [ ] Tests : `floor` avec un trou au centre produit des dalles qui couvrent tout sauf le trou (somme des aires = aire − aire du trou) ; `room` avec une porte crée un linteau au-dessus de la porte ; `pad` posé sur un bloc de hauteur 2 a `y = 2`.

### Tâche 4 : collisions
- [ ] `map/collision.ts` (repris de la page de visite, testé) :
  - `surfaceAt(map, x, z, maxY)` : plus haute surface (bloc ou rampe) sous `maxY` ;
  - `groundAt(map, x, z, y)` : max de `surfaceAt` sur le centre et 4 points à 0,25 m, avec `maxY = y + stepHeight` ;
  - `hitsWall(map, x, z, y)` : un bloc chevauche le cylindre du joueur entre `y + stepHeight` et `y + playerHeight` ;
  - `ceilingAt(map, x, z, headFrom, headTo)` ;
  - `segmentBlocked(map, a, b)` : premier `t ∈ [0,1]` où le segment touche un bloc (test rayon / boîte par la méthode des « slabs »), ou `null`.
- [ ] Tests sur une mini-map (sol + un mur + une rampe + une dalle) : sol trouvé, rampe à mi-hauteur, mur bloquant, passage sous la dalle possible, `segmentBlocked` renvoie ≈ la bonne fraction.

### Tâche 5 : physique du joueur
- [ ] `physics.ts` : `PlayerState {pos, vel, yaw, pitch, onGround, dashUntil, dashReadyAt, padUntil}`, `Input {seq, dt, fwd, back, left, right, jump, dash, yaw, pitch}`, `stepPlayer(state, input, map, now): PlayerState` (fonction pure, sous-pas de 1/120 s). Même algorithme que la page de visite : accélération sol/air, saut si au sol, dash si recharge prête, gravité, déplacement x puis z avec `hitsWall`, plafond, sol et accroche en descente (< 0,6 m), tremplins.
- [ ] Tests : chute sur un sol plat et arrêt à `y=0` ; saut qui monte à environ 2 m ; course à 9 m/s en 1 s ; le dash pousse à 18 m/s puis respecte 2 s de recharge ; un mur arrête le joueur ; un tremplin donne la vitesse prévue ; montée d'une rampe.

### Tâche 6 : tir
- [ ] `shot.ts` : `rayCapsule(origin, dir, center, radius, height)` → distance ou `null` (cylindre vertical) ; `traceShot(map, origin, dir, targets[{id,pos}])` → `{hitId|null, end}` : le joueur le plus proche touché avant le premier mur.
- [ ] Tests : cible en face touchée ; cible derrière un mur non touchée ; deux cibles alignées, la plus proche gagne.

### Tâche 7 : règle de spawn
- [ ] `spawn.ts` : `chooseSpawn(map, enemies: Vec3[], lastUsed: number[], now, rand)` → index. Règle de la spec, ligne de vue testée avec `segmentBlocked` entre les yeux de l'adversaire et un point à hauteur d'yeux au-dessus du spawn.
- [ ] Tests : un spawn à moins de 8 m d'un ennemi n'est jamais choisi ; sans ennemi, n'importe quel spawn ; tous écartés → le plus éloigné ; un spawn utilisé il y a 1 s est déconseillé.

### Tâche 8 : map provisoire « Camp de base »
- [ ] `maps/camp.ts` : 48 × 44 m, trois niveaux (sol, +5 m, +10 m), ambiance crépuscule en forêt. Clairière centrale, tente, conteneurs empilés, échafaudage et tour radio, passerelle entre les conteneurs et la tour, cabanes avec étage, rampes et deux tremplins, 12 spawns.
- [ ] Test : chaque spawn est sur un sol (`|groundAt − y| < 0,15`) et n'est pas dans un mur ; chaque tremplin a un sol.

### Tâche 9 : protocole
- [ ] `protocol.ts` :
  - client → serveur : `join {name}`, `start`, `input {inputs: Input[]}`, `fire {seq, yaw, pitch, renderTime}`, `ping {t}` ;
  - serveur → client : `welcome {you, roomCode, mapId, config, hostId}`, `lobby {players[{id,name,color}], hostId, state}`, `snapshot {time, ack, players[{id,x,y,z,yaw,pitch,alive}]}`, `kill {killer, victim, from, to}`, `respawn {id, x,y,z, yaw}`, `scores {list[{id,name,kills,deaths}]}`, `matchEnd {winner, list}`, `pong {t, serverTime}`, `error {message}`.
  - `encode()` / `decode()` en JSON, avec validation minimale des champs côté serveur.

### Tâche 10 : salon côté serveur
- [ ] `room.ts` : classe `Room(code, mapId, clock, rand)` :
  - `addPlayer(name, send)` → id, couleur de parka attribuée parmi 12 ; `removePlayer(id)` ; le premier entré est l'hôte ; `start(byId)` refusé si < 2 joueurs ou si pas l'hôte ;
  - `pushInputs(id, inputs)` mis en file, rejoués au pas suivant avec `stepPlayer` ; on garde `ack` = dernier `seq` traité ;
  - `fire(id, msg)` : refusé si mort ou recharge pas finie ; remonte les positions des autres à `renderTime − interpDelay` (plafonné à 200 ms) grâce à un historique de 1 s ; `traceShot` depuis les yeux du tireur ; élimination, score, réapparition après 1 s par `chooseSpawn` ;
  - `tick()` à 60 Hz, `snapshot()` à 30 Hz ; fin de partie à 25 éliminations ou 10 minutes → `matchEnd`, retour en salle d'attente ;
  - rejoindre une partie en cours : apparition immédiate.
- [ ] Tests avec horloge simulée : deux joueurs, l'hôte lance, A tire sur B en face → B mort, score A = 1, B réapparaît après 1 s ; tir pendant la recharge refusé ; 25 éliminations → `matchEnd`.

### Tâche 11 : serveur HTTP + WebSocket
- [ ] `rooms.ts` : codes de 6 caractères sans ambiguïté (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), suppression d'un salon vide après 5 min.
- [ ] `http.ts` : `POST /rooms` → `{code}` ; `GET /health` → `ok` ; WebSocket `/ws?room=CODE` ; CORS ouvert sur l'origine du client ; boucle globale qui appelle `tick()` des salons.
- [ ] Test d'intégration : démarrage sur un port libre, création de salon, deux clients `ws` qui rejoignent, reçoivent `welcome` puis `lobby` avec deux joueurs.

### Tâche 12 : client, accueil et salle d'attente
- [ ] Vite + TypeScript, `index.html` sobre, polices Barlow Condensed (titres, HUD) et Instrument Sans (texte).
- [ ] Routage : `/` accueil, `/s/CODE` salon. Accueil : pseudo (mémorisé), bouton « Créer un salon ». Salon : pseudo si absent, liste des joueurs avec leur couleur, lien à copier, « Lancer la partie » pour l'hôte (désactivé sous 2 joueurs, avec la raison).
- [ ] `connection.ts` : URL du serveur depuis `VITE_SERVER_URL` ; si la connexion échoue, message « Réveil du serveur… » et nouvel essai toutes les 3 s pendant 90 s ; état d'erreur clair ensuite.

### Tâche 13 : rendu diorama plat
- [ ] `renderer.ts` : WebGLRenderer, ombres PCF douces 1024 px (réglage pour les couper), échelle de résolution, brouillard et ciel en dégradé selon l'ambiance de la map.
- [ ] `world.ts` : un `MeshPhongMaterial` à facettes par matériau de la palette, toutes les boîtes et marches d'un même matériau fusionnées en une géométrie (BufferGeometryUtils.mergeGeometries) ; tremplins avec anneau animé ; lampes.
- [ ] `avatar.ts` : perso trapu en parka (corps, capuche, fourrure, visage, jambes, bras, arme) à la couleur du joueur, pseudo au-dessus ; les matériaux des avatars ignorent le brouillard.
- [ ] `viewmodel.ts` : manche de parka, gant, arme ; recul au tir.
- [ ] `effects.ts` : rayon (cœur blanc + halo orange qui s'estompe en 0,4 s), éclats triangulaires, marque de touche.

### Tâche 14 : boucle de jeu côté client
- [ ] `input.ts` : capture du pointeur au clic, ZQSD/WASD via `event.code`, Espace, Maj ou clic droit pour le dash, clic gauche pour tirer, Tab pour les scores, Échap pour libérer la souris ; sensibilité réglable.
- [ ] `predict.ts` : pas fixe de 1/60 s, applique `stepPlayer` localement, garde les entrées non confirmées, se recale sur `snapshot.ack` puis rejoue.
- [ ] `interp.ts` : tampon des snapshots, affiche les autres à `now − 100 ms`.
- [ ] `session.ts` : envoie les entrées à chaque pas, le tir avec `renderTime`, applique `kill` / `respawn` / `scores` / `matchEnd`, affiche l'effet du tir local tout de suite (le serveur confirme l'élimination).
- [ ] `hud.ts`, `scoreboard.ts` : viseur, recharge, dash, score sur 25, 3 dernières éliminations, marque de touche, tableau Tab, écran de fin avec « Rejouer ».

### Tâche 15 : vérification de bout en bout
- [ ] `pnpm test` et `pnpm -r typecheck` passent.
- [ ] Script `scripts/e2e.mjs` (Playwright) : lance serveur et client, ouvre deux navigateurs Chromium, crée un salon dans le premier, rejoint avec le lien dans le second, lance, vérifie que les deux voient deux joueurs et que les positions se mettent à jour ; un tir scripté face à l'autre joueur incrémente le score.
- [ ] Capture d'écran en jeu, relue.
- [ ] Commit et push.

## Autocontrôle du plan

- Couverture de la spec, étape 1 : salon par lien (11, 12), déplacement et dash (5), tir et éliminations (6, 10), score à 25 et 10 min (10), réapparition et règle de spawn (7, 10), map provisoire (8), DA diorama plat (13), réveil du serveur (12), rejoindre en cours (10), réglages ombres et résolution (13). Les comptes, la boutique, les quatre maps et les modèles Blender sont dans les étapes 2 à 4.
- Noms cohérents : `stepPlayer`, `traceShot`, `chooseSpawn`, `buildMap`, `groundAt` utilisés partout avec la même signature.
