---
name: shootdabih-maps
description: Use when creating, reworking or reviewing a map of shootdabih (packages/shared/src/maps/*.ts) — deathmatch arenas and capture the flag maps. Covers the builder API, coordinates, density rules from the Quakecraft analysis, distinctiveness, mode requirements and the validation commands to run before shipping.
---

# Faire une map shootdabih

Une map est un fichier TypeScript dans `packages/shared/src/maps/`, enregistré dans `maps/index.ts`. Le même fichier sert au serveur (collisions, spawns) et au client (rendu). Tout est en mètres.

## Repères

- `x` vers l'est, `z` vers le sud, `y` vers le haut. Le sol de base est à `y = 0`, son bloc va de `-1` à `0`.
- `yaw = 0` regarde vers `-z`.
- Les collisions sont des **boîtes alignées sur les axes** : pas de rotation. Les courbes se font en escalier de boîtes, les pentes avec `ramp`.
- Joueur : rayon 0,3 m, hauteur 1,75 m, yeux à 1,6 m, marche franchissable 0,55 m, saut ~2 m, double saut ~3,6 m.

## API du builder (`b`)

| Appel | Effet |
|---|---|
| `block(x, z, w, d, y0, y1, mat)` | Bloc plein (collision + rendu). |
| `hiddenBlock(...)` | Collision seule, le rendu vient d'un `prop` (voiture…). |
| `deco(...)` | Rendu seul, aucune collision (eau, toile). |
| `slab(x, z, w, d, y, mat)` | Dalle de 0,4 m, dessus à `y` : planchers, passerelles. On passe dessous si `y ≥ 2,3`. |
| `ramp(x, z, w, d, h0, h1, 'x'\|'z', mat)` | Pente : `h0` au bord bas de l'axe, `h1` au bord haut. Dessinée en marches. Pas de collision dessous. |
| `floor(x, z, w, d, y, mat, holes)` | Plancher percé de trémies `[x, z, w, d]` (escaliers, puits). |
| `room(x, z, w, d, y0, y1, mat, openings)` | Quatre murs de 0,5 m. Ouverture : `[côté n\|s\|w\|e, décalage, largeur, hauteur=3, bas=0]` (porte ou fenêtre). |
| `walls(w, d, h, mat)` | Enceinte autour de la map. |
| `pad(x, z, vx, vy, vz)` | Tremplin posé sur le sol déjà construit. `vy` 15 ≈ +5 m, 21 ≈ +10 m. |
| `spawn(x, y, z)` | Point de réapparition au centre de la case `(x+0,5 ; z+0,5)`, `y` = hauteur du sol. |
| `pickup(x, z)` | Emplacement de bonus ou de capacité, posé sur le sol existant. |
| `lamp(x, y, z)` | Lampe (les 4 premières éclairent). |
| `prop({ kind, x, y, z, s, r, mat, w, d, h })` | Décor : `pine`, `rock`, `tuft`, `mountain`, `fire`, `roof` (toit en pente), `car`. |

Matériaux (`Mat`) : `ground dirt snow rock wood plank metal grate concrete tent tentDark cont1 cont2 cont3 cabin roof trunk leaf orange white dark glass tire pad water`. Les couleurs sont dans `apps/client/src/render/palette.ts`.

`MapDef` : `id`, `name`, `size [w, d]`, `players [min, max]`, `mood` (ciel, brouillard, lumières), `lobby { x, z, angle }` (où les joueurs posent dans la salle d'attente : un coin dégagé, la caméra regarde depuis `angle`), optionnel `ctf` (voir plus bas), `build(b)`.

## Règles de densité (tirées des maps Quakecraft Temple, Ruin, Struttura)

| Mesure | Cible |
|---|---|
| Taille | 40 à 65 m de côté |
| Niveaux | 3 ou 4, espacés d'environ 5 m |
| Surface sur 2 niveaux ou + | ≥ 30 % |
| Vue médiane à hauteur d'yeux | ≤ 9 m |
| Vue longue (90 %) | ≤ 36 m |
| Sorties | au moins deux par zone, pas de cul-de-sac |
| Spawns | 1,5 à 2 par joueur maximum, sur tous les niveaux |
| Objets à ramasser | 6 à 8, répartis, dont au moins un en hauteur |

Ce qui fait baisser la vue médiane : des couverts plus hauts que les yeux (≥ 1,8 m) au milieu des grandes zones, des murs à ouvertures, des troncs, des conteneurs, des cabanons sur les passerelles. Les longues lignes droites (bord de map, berge, couloir) se coupent avec un objet tous les 10 à 12 m.

## Chaque map doit être différente

Avant d'écrire, choisir **un archétype qui n'existe pas encore** dans le pool, et le dire en commentaire en tête du fichier :

| Archétype | Exemple existant |
|---|---|
| Anneau ouvert autour d'une clairière | Camp de base |
| Intérieur : modules et couloirs, peu de ciel, symétrique | Station polaire |
| Verticalité : une grande structure centrale à 4 niveaux | à faire |
| Terrasses en pente sur un relief | à faire (Chantier de montagne) |

Varier aussi : ambiance (`mood`), matériaux dominants, forme du centre, place des tremplins. Deux maps qui partagent l'archétype et la palette se ressemblent, même avec des tailles différentes.

## Exigences par mode

- **Deathmatch** : spawns et pickups ci-dessus.
- **Capture the flag** : `ctf: { bases: [{ x, z }, { x, z }] }` aux deux extrémités, à la même hauteur ou presque. La map doit être **à peu près symétrique** (miroir ou rotation de 180°) pour que les équipes soient à égalité. Au moins 3 chemins entre les bases, dont un en hauteur. Au moins 4 spawns près de chaque base.

## Valider avant de livrer

1. `pnpm test` : les tests vérifient pour chaque map que chaque spawn est sur un sol et pas dans un mur, que chaque tremplin a un sol, et les règles de densité.
2. `apps/server/node_modules/.bin/tsx tools/metrics.ts <id>` : vue médiane, vue longue, part multi-niveaux.
3. `apps/server/node_modules/.bin/tsx tools/check-spawns.ts <id>` : liste précise des spawns mal placés.
4. Ajouter l'id à la boucle des tests de maps dans `packages/shared/test/shared.test.ts`.
5. Regarder la map en vrai : `pnpm --filter @sdb/client build`, lancer le serveur avec `STATIC_DIR`, et prendre une capture (salle d'attente et en jeu).
