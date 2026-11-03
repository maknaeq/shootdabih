# shootdabih : design

Date : 2026-11-03
Statut : à relire par Quentin

## Résumé

shootdabih est un FPS d'arène multijoueur qui tourne dans le navigateur, pensé pour jouer entre amis. On crée un salon, on envoie le lien, les autres arrivent directement dans la partie. Tout le monde a la même arme : un rayon instantané qui élimine en un tir. Le premier à 25 éliminations gagne. Le jeu doit tourner à 60 images par seconde sur un portable sans carte graphique.

Inspiration de genre : le mini-jeu Quakecraft et les FPS d'arène rapides. Le nom, l'arme, les maps et le look sont originaux.

## Décisions prises

| Sujet | Décision |
|---|---|
| Mode de jeu | Deathmatch chacun pour soi uniquement. Pas de mode solo, pas d'équipes, pas de duel pour l'instant. |
| Arme | Une seule, un rayon instantané, un tir touché élimine. |
| Décor | Fixe, rien ne se casse. |
| Direction artistique | « Diorama plat » : low-poly à facettes, aplats sans texture, ombres nettes, fond vert-gris sourd, accents orange et blancs. |
| Thème | Expédition : camp, station polaire, chantier de montagne, relais forestier. |
| Accès | Lien de salon, jeu possible avec un simple pseudo. Compte optionnel pour garder ses points. |
| Boutique | Apparence seulement. Les réglages de jeu sont les mêmes pour tout le monde. |
| Plateforme | Navigateur, ordinateur avec clavier et souris. Pas de mobile. |

## 1. Règles du jeu

Toutes les valeurs sont des réglages de départ, regroupés dans un seul fichier de configuration partagé pour pouvoir les ajuster après les premières parties.

| Réglage | Valeur de départ |
|---|---|
| Vitesse de course | 9 m/s |
| Impulsion de saut | 9,5 m/s (environ 2 m de haut) |
| Gravité | 22 m/s² |
| Dégâts de chute | aucun |
| Dash | 18 m/s vers l'avant pendant 0,22 s, recharge 2 s |
| Recharge du rayon | 1,2 s |
| Portée du rayon | illimitée, arrêté par les murs |
| Réapparition | 1 s après l'élimination |
| Fin de partie | premier à 25 éliminations, ou 10 minutes |
| Joueurs par salon | 2 à 12 |
| Tremplins | vitesse fixée par tremplin dans la map |

Contrôles : ZQSD ou WASD, souris pour viser (capture du pointeur), clic gauche pour tirer, Maj ou clic droit pour le dash, Espace pour sauter. Sensibilité, champ de vision et touches réglables.

HUD : viseur, barre de recharge du rayon, état du dash, score personnel sur 25, liste des dernières éliminations, marque de touche et mention « Élimination ». Tableau des scores sur Tab.

## 2. Direction artistique

Référence validée : piste B de la page « Pistes DA, 3e tour » (https://claude.ai/artifact/Q9YMYsiVi9PbXLsR66z5rT).

- Formes low-poly à facettes (ombrage plat), aucune texture : la couleur vient du matériau.
- Une lumière principale avec une carte d'ombres de 1024 px, plus une lumière d'ambiance ciel et sol. Quelques lampes chaudes ponctuelles, sans ombre.
- Palette : terre #6E6655, forêt #2E4A43, ciel #1E3532, orange #E8843E, blanc #F3EFE6. Chaque map a sa variante (jour, crépuscule, neige) dans la même logique : fond sourd, accents orange.
- Personnages : silhouettes trapues en parka. Chaque joueur choisit sa couleur de parka, l'orange reste réservé aux accents du décor pour ne pas brouiller la lecture.
- Lisibilité : les joueurs ne prennent pas le brouillard et gardent une couleur franche même à l'ombre.
- HUD : Barlow Condensed en majuscules, blanc et orange, filets fins.
- Modèles définitifs (persos, véhicules, tentes, modules) générés par scripts Blender en ligne de commande et exportés en glTF. Exigence : un rendu propre, topologie low-poly nette, normales et facettes cohérentes, pas de faces parasites, échelle et origines correctes. En attendant, des formes générées par le code servent de provisoire.

## 3. Maps

### Règles de construction

Tirées de l'analyse des maps Quakecraft Temple, Ruin et Struttura :

| Mesure | Cible |
|---|---|
| Taille | 40 à 65 m de côté |
| Étages | 3 ou 4 niveaux, espacés d'environ 5 m |
| Surface sur deux niveaux ou plus | au moins 30 % |
| Vue médiane à hauteur d'yeux | 9 m au plus |
| Vue longue (90 % des regards) | 36 m au plus |
| Sorties | au moins deux par zone |
| Spawns | 1,5 à 2 par joueur maximum, répartis sur tous les niveaux |

Un script mesure ces chiffres sur chaque map et fait échouer la vérification si une map sort des cibles. Il vérifie aussi que chaque spawn est sur un sol et n'est pas dans un mur.

### Pool

| Map | Taille | Joueurs | Ambiance | Idée |
|---|---|---|---|---|
| Camp de base | petite | 2 à 6 | crépuscule en forêt | clairière, tentes, conteneurs empilés, échafaudage et tour radio |
| Relais forestier | petite | 4 à 8 | jour couvert | cabane sur pilotis, passerelles dans les arbres, rivière en contrebas |
| Station polaire | grande | 7 à 12 | neige, lumière froide | modules reliés par des passerelles, intérieurs chauffés |
| Chantier de montagne | grande | 7 à 12 | fin de journée | terrasses, grues, cabanes, plots |

Le serveur choisit la map selon le nombre de joueurs au lancement : une petite jusqu'à 6, une grande à partir de 7, en évitant de rejouer la même deux fois de suite.

### Format

Une map est un fichier de données : blocs, dalles, rampes, tremplins, spawns, lampes, ambiance. Le client en tire l'affichage, le client et le serveur en tirent les collisions. Le format reprend celui de la page de visite (https://claude.ai/artifact/4qgeJggSc5WjeUQGrfGxhG), qui servira aussi d'outil de relecture des maps.

## 4. Règle de spawn

Validée avec les réglages par défaut de la page « Map pool et spawns ». Pour le joueur qui réapparaît :

1. Écarter les points à moins de 8 m d'un adversaire.
2. Noter chaque point restant : distance à l'adversaire le plus proche divisée par 30 m, plafonnée à 1.
3. Retirer, pour chaque adversaire qui voit le point à moins de 40 m : 1 × (1 − distance / 40).
4. Retirer 0,8 × (1 − temps depuis l'usage / 4 s) si le point a servi il y a moins de 4 s.
5. Tirer au hasard parmi les 3 meilleurs points.
6. Si tous les points sont écartés, prendre le plus éloigné des adversaires.

La vue est testée en 3D, à hauteur d'yeux, contre les collisions de la map. Indicateur suivi en partie : part des joueurs éliminés moins de 3 s après leur spawn. Objectif : moins de 5 %.

## 5. Salons et réseau

### Parcours

1. Sur l'accueil, on tape un pseudo (ou on se connecte) et on crée un salon.
2. Le lien `shootdabih…/s/ABC123` s'affiche avec un bouton Copier.
3. Les amis ouvrent le lien, tapent un pseudo, arrivent dans la salle d'attente du salon.
4. Le créateur lance la partie dès qu'il y a 2 joueurs. On peut rejoindre une partie en cours.
5. À la fin : tableau des scores, points gagnés, bouton « Rejouer » qui relance dans le même salon.

### Architecture

- Serveur Node.js qui fait foi : il simule la partie à 60 pas par seconde et envoie l'état à 30 Hz par WebSocket.
- Le client envoie ses entrées numérotées. Il anticipe son propre déplacement et se recale sur le serveur. Les autres joueurs sont affichés avec 100 ms d'interpolation.
- Tirs : le client envoie le tir avec l'instant où il l'a vu. Le serveur remonte les positions dans le temps (200 ms au plus), vérifie la ligne de tir contre les collisions et valide ou non.
- Garde-fous : le serveur refuse les tirs plus rapides que la recharge et les déplacements plus rapides que possible.
- Un processus serveur gère plusieurs salons. Un salon vide disparaît après 5 minutes.

### Hébergement

- Client statique sur Vercel (shootdabih.vercel.app).
- Serveur de jeu sur Render, offre gratuite, région Francfort. Vercel ne convient pas aux connexions WebSocket qui restent ouvertes.
- L'offre gratuite de Render endort le serveur après 15 minutes sans trafic. Le client affiche « Réveil du serveur… » pendant le démarrage (environ une minute) et réessaie seul.

## 6. Comptes, points et boutique

### Comptes

- Supabase Auth en pseudo + mot de passe. Aucun e-mail n'est envoyé : l'adresse technique est dérivée du pseudo et la confirmation par e-mail est désactivée. Pas de récupération de mot de passe automatique pour l'instant.
- Sans compte, on joue avec un pseudo, sans gagner de points.

### Points

| Action | Points |
|---|---|
| Élimination | 10 |
| Série de 5 sans mourir | 25 |
| Victoire | 100 |
| Partie terminée | 20 |

Calculés par le serveur à la fin de chaque partie et écrits en base par lui seul.

### Boutique

Uniquement de l'apparence : couleur de parka, bonnet ou capuche, couleur du rayon, effet d'élimination, son du tir. Des objets de départ sont offerts à tout le monde.

### Base de données (Supabase Postgres)

| Table | Contenu |
|---|---|
| `profiles` | id (lié au compte), pseudo, points, date de création |
| `matches` | id, map, début, fin, gagnant |
| `match_players` | partie, profil (vide pour un invité), pseudo, éliminations, morts, meilleure série, points gagnés |
| `items` | id, type, nom, prix |
| `unlocks` | profil, objet, date |
| `loadouts` | profil, emplacement, objet équipé |

Règles d'accès : chacun lit son profil, ses objets et sa tenue. Seul le serveur de jeu, avec sa clé de service, écrit les parties et les points. Les achats passent par une fonction qui vérifie le solde.

## 7. Technique côté client

- Vite, TypeScript, Three.js.
- Dépôt en trois parties : `shared` (règles, physique, collisions, règle de spawn, format des maps), `client`, `server`.
- Performance visée : 60 images par seconde sur un portable sans carte graphique, moins de 300 appels de dessin, géométries fusionnées par matériau.
- Réglages graphiques : ombres oui ou non, échelle de résolution, champ de vision.
- Navigateurs testés : Safari, Zen (Firefox) et Chrome.

## 8. Tests

- Tests unitaires de `shared` : déplacement (saut, dash, rampes, tremplins, plafonds), collisions, règle de spawn, calcul des points.
- Script de mesure des maps (section 3).
- Test de charge : des faux clients scriptés qui remplissent un salon de 12 joueurs pendant 10 minutes, en mesurant le temps de pas du serveur et la bande passante.
- Parties de test entre amis à chaque étape.

## 9. Étapes

1. **Socle multijoueur** : salon par lien, déplacement, tir, éliminations, score à 25, réapparition, une map provisoire (Camp de base en formes simples), DA diorama plat.
2. **Les quatre maps** avec le script de mesure et la règle de spawn, tableau des scores, réglages.
3. **Comptes, points et boutique.**
4. **Modèles Blender** et finitions (sons, effets, menus).

Chaque étape aura son plan détaillé. Le premier plan couvre l'étape 1.

## Hors périmètre pour l'instant

Mode solo ou bots, équipes, duel, mobile, classement public, chat vocal, matchmaking entre inconnus.

## Points ouverts

- Les valeurs de points et de recharge seront ajustées après les premières parties.
- Le domaine du site reste à choisir.
