# État d'avancement — à jour au 2026-09-07

Source de vérité sur ce qui existe réellement. **Vérifié, pas recopié** : les chiffres de
banque viennent d'une requête sur le D1 distant, l'état du déploiement d'un `wrangler
deploy` réel. Historique détaillé : `git log --oneline`.

## En production

- **En ligne** : le Worker `nonoculture` est déployé sur Cloudflare (compte connecté,
  `wrangler deploy` depuis `apps/server`). Le front buildé est servi par **Workers Static
  Assets** (bloc `[assets]` de `wrangler.toml`), pas par un hébergeur séparé.
- **D1 distant** `quiproquo-db` : migrations 0001→0003 appliquées, banque complète chargée.
- **Repo GitHub privé** : `github.com/GregoryGci/nonoculture`, branche `master`.
- **R2 : volontairement pas utilisé.** Cloudflare exige une carte bancaire pour activer R2 ;
  la décision prise est de ne pas en dépendre. Les médias (audio, images) sont des fichiers
  statiques dans `apps/web/public/media/`, servis par le même binding `ASSETS`. Le bloc
  `[[r2_buckets]]` reste commenté dans `wrangler.toml` — ne pas le décommenter sans raison,
  le code sait se passer de R2 (`mediaAvailable`).

## Banque de questions (comptée sur le D1 distant)

| answer_kind | type  |    n |
| ----------- | ----- | ---: |
| text        | text  | 4253 |
| number      | text  |  625 |
| list        | text  |  705 |
| math        | text  |  420 |
| text        | image |  268 |
| text        | audio |   15 |
| **total**   |       | 6286 |

À quoi s’ajoutent **223 questions `answer_kind = "blur"`** (173 portraits LoL, 50 drapeaux),
chargées en local mais **pas encore sur le D1 distant** : le déploiement est en attente.

Réparties sur **23 thèmes** et **40 familles** (`family`), la plus grosse à 488 questions. La colonne
`family` existe pour une raison précise : sans elle, choisir le thème « sport » sortait
quinze fois « quel sport pratique X ? » d'affilée. Le tirage fait maintenant un round-robin
entre familles (`diversify()` dans `apps/server/src/lib/questions.ts`).

Générateurs (tous relançables, tous sur des sources CC0) :

- `apps/server/scripts/generate-questions.mjs` — 19 familles depuis **Wikidata** (SPARQL,
  CC0). Difficulté calculée en **rang percentile à l'intérieur de la famille**, pas par
  seuil absolu : tous les pays ont un nombre de sitelinks proche, un seuil fixe classait
  Avarua en « facile ». Chaque question passe par `lib/answer-leak.mjs`, qui rejette celles
  qui contiennent leur propre réponse (16 % du premier jet — « Dans quelle ville joue le
  club Spartak Moscou ? »).
- `apps/server/scripts/generate-maths.mjs` — 420 questions d’arithmétique mentale sur 14
  familles, sans réseau : la source de vérité est ici l’arithmétique.
- `apps/server/scripts/generate-blasons.mjs` — 73 armoiries nationales, la seule famille
  d’images encore constructible en licence libre (voir la sonde plus haut).
- `apps/server/scripts/generate-lists.mjs` — 705 questions « citez… » (~22 réponses
  acceptées chacune), la matière première des duels.
- `apps/server/scripts/fetch-freesound.mjs` — sons CC0 via l'API Freesound (clé perso,
  passée en variable d'environnement, jamais écrite sur disque).
- `apps/server/scripts/check-seed.mjs` — contrôle les fichiers écrits à la main avant tout
  chargement : doublons internes, collisions avec le reste de la banque, champs manquants et
  réponse dans l’énoncé. Il a attrapé 21 fuites sur le premier jet des questions Dofus et 41
  dans les fichiers historiques, déjà en ligne.
- `apps/server/scripts/generate-paintings.mjs` — 105 questions image sur des tableaux
  (thème **Art**). Une sonde de licence sur cinq familles candidates (tableaux, portraits,
  armoiries, monuments, animaux) a donné 97 % de domaine public pour les tableaux contre
  85 % pour les autres : l'art ancien est hors droits par construction.
- `apps/server/scripts/generate-flags.mjs` — 90 drapeaux.
- `apps/server/scripts/generate-lol-portraits.mjs` — 173 portraits de champions depuis le
  **Data Dragon** de Riot, cadrés sur le carré haut de l’art de chargement (la tête et les
  épaules), en `answer_kind = "blur"`. Art propriété de Riot, utilisé ici comme contenu de
  fan sur un jeu privé — c’est la même situation que les questions LoL déjà en banque, et
  Data Dragon est le CDN public de Riot lui-même, pas un tiers qui redistribue son bien.
- `apps/server/scripts/generate-flag-blur.mjs` — 50 drapeaux flous, dérivés **sans aucun
  téléchargement** des WebP que `generate-flags.mjs` a déjà produits. Énoncés volontairement
  différents de ceux des questions nettes : l’index unique est sur `(prompt, answer)` et un
  énoncé identique aurait fait avaler les 50 lignes par `INSERT OR IGNORE`, sans erreur.
- Les images passent par une vérification de licence **fichier par fichier** via l'API
  Commons, jamais au niveau du site : la licence d'un fichier ne se déduit pas de celle
  de la plateforme qui l'héberge.
- **Les URL de médias sont des tokens** (`packages/shared/src/media-token.ts`) : la clé nomme
  la réponse, donc elle ne sort jamais du serveur. Ce que ça arrête : lire la réponse dans
  l'onglet réseau, et deviner un nom de fichier pour le vérifier contre le token (il est salé).
  Ce que ça n'arrête pas : un joueur qui note les paires token/réponse aux reveals et se
  construit sa table sur plusieurs parties — il faudrait un token par manche, donc router
  chaque image par le Durable Object, et l'image cesserait d'être un asset statique gratuit.

## Modes de jeu

Le deck mélange des questions ordinaires et des manches spéciales, chacune réglable par
l'hôte dans le lobby (`GameSettings`, `HostSettings.tsx`) :

| Réglage         | Défaut | Effet                                                        |
| --------------- | -----: | ------------------------------------------------------------ |
| `questionCount` |     20 | 5 à 40 slots au total                                        |
| `chainRounds`   |      1 | manches « téléphone dessiné »                                |
| `bluffRounds`   |      1 | manches bluff                                                |
| `duelRounds`    |      1 | duels 1v1                                                    |
| `reflexRounds`  |      1 | manches réflexe (le premier à taper au vert)                 |
| `blurRounds`    |      1 | manches image floue (elle se précise, le plus rapide marque) |
| `numericRounds` |      2 | questions « le plus proche gagne »                           |

**« Tous les thèmes » exclut `lol` et `dofus`** (`OPT_IN_THEMES` dans `packages/shared`) : ce
sont des questions sur un jeu précis, et une table dont la moitié n'y a jamais joué cesse d'être
un quiz. Ils restent sélectionnables explicitement.

**Images : ce que les licences permettent.** Affiches de films et jaquettes de jeux sont sous
droits, sans recours. Sonde sur cinq familles Commons, 50 candidats chacune : blasons 86 % de
domaine public, instruments 29 %, plats 12 %, monuments 0 %. Les photos modernes sont presque
toutes en CC BY-SA, donc « devine ce monument / ce plat » n'est pas constructible librement.
Les trois familles image en banque sont donc drapeaux, tableaux et blasons.

Chaque manche spéciale consomme un slot ; jamais en première ni dernière position. Les
manches à 3 joueurs minimum (`CHAIN_MIN_PLAYERS`, `BLUFF_MIN_PLAYERS`, `DUEL_MIN_PLAYERS`)
sont sautées si la room est trop petite au moment où le slot arrive.

- **Bluff** (`BLUFF_WRITE` 45s → `BLUFF_VOTE` 30s → `BLUFF_REVEAL` 12s) — chacun invente une
  fausse réponse, puis vote pour celle qu'il croit vraie. +2 si tu trouves, +1 par joueur
  piégé par ton mensonge. Un faux identique à la vraie réponse est écarté au lieu d'être
  affiché deux fois ; on ne peut pas voter pour soi. L'auteur d'une option **n'est jamais
  envoyé au client** avant le reveal.
- **Duel** (`DUEL_PREDICT` 15s → `DUEL_ANSWER` 45s → `DUEL_REVEAL` 12s) — deux joueurs
  s'affrontent sur une question liste (« citez des films réalisés par… »), les autres
  parient sur le gagnant. +3 au vainqueur, +1 à chaque spectateur qui a vu juste. Auto-scoré :
  la question porte son propre ensemble de réponses acceptées.
- **Réflexe** (`REFLEX_WAIT` → `REFLEX_GO` → `REFLEX_REVEAL` 10s) — l’écran passe au vert
  après un délai aléatoire de 2 à 7 s, le premier à taper gagne (+3), le deuxième +1, et
  partir avant le vert élimine pour la manche. **Le moment du vert n’est jamais envoyé au
  client** : il vit dans `reflex.goAtTs`, côté Durable Object, et `phaseDeadlineTs` reste
  `null` pendant l’attente — un compte à rebours diffusé serait une réponse diffusée. Les
  temps sont mesurés à l’arrivée sur le serveur, trajet réseau compris (~40 ms mesurés) :
  face aux ~250 ms de temps de réaction humain, ce n’est pas ce qui décide la manche.
- **Image floue** (`BLUR_GUESS` 15s → `BLUR_REVEAL` 10s, `answer_kind = "blur"`) — une image
  arrive floutée à 34 px et se précise linéairement en 10 s. On répond une seule fois, et les
  bonnes réponses sont payées **dans l'ordre d'arrivée** : 5, 3, 2, puis 1 pour toutes les
  suivantes. Auto-scoré comme le duel — un nom de champion ou de pays se vérifie, il n'y a rien
  à soumettre à l'hôte. **Le rayon du flou n'est pas envoyé** : c'est une fonction du temps
  restant, que le client a déjà via `phaseDeadlineTs` et `BLUR_SHARPEN_MS` — le diffuser serait
  un `STATE_SYNC` par frame pour de l'arithmétique. Deux sources en banque : 173 portraits de
  champions LoL (Data Dragon, thème `lol`, opt-in) et 50 drapeaux flous (`drapeaux`, thème
  général) — sans cette seconde source la manche n'existerait que pour les tables qui cochent
  « League of Legends ».
- **Maths** (thème `maths`, `answer_kind = "math"`) — arithmétique mentale courte, réponse
  exacte, **le plus rapide à répondre juste marque 3, les autres bonnes réponses 1**.
  420 questions générées hors ligne sur 14 familles (addition, puissances, racines,
  pourcentages, priorités opératoires…), sans réseau : la source de vérité est l’arithmétique.
- **Le plus proche gagne** — questions `answer_kind = "number"`, scorées par distance
  arithmétique (+2 au plus proche, +3 en plein dans le mille, ex æquo tous récompensés).
  Ces réponses **ne remontent pas dans la review de l'hôte** : il n'y a rien à juger.

## Le reste, en bref

- **Machine à états** : serveur autoritaire, DO par room, Hibernation API, Alarms API
  (aucun `setTimeout` dans le DO). Détail dans `CLAUDE.md`.
- **Review finale réservée à l'hôte** : les joueurs voient un écran d'attente avec le podium
  provisoire pendant qu'il note.
- **Reconnexion** : `playerToken`, grâce de 5 min, migration d'hôte, détection de double
  onglet, nettoyage de room à 30 min d'inactivité.
- **DA** : refonte « premium » (Apple / SpaceX / Starlink) — fond sombre, typographie
  serrée, animations `motion` sur courbe expo-out `cubic-bezier(0.16, 1, 0.3, 1)`. Avatars :
  set **bottts** de DiceBear, généré **hors ligne** vers `apps/web/public/avatars/`.
- **Dessin** : `<canvas>` + Pointer Events, 6 couleurs, 3 épaisseurs, gomme, envoi
  automatique 1,2 s avant la fin du temps même sans valider. Les octets ne transitent jamais
  par `GameState` (clés de storage séparées).
- **Qualité** : ESLint + Prettier + CI, TypeScript strict sans `any`, **121 tests** Vitest.
  Les scripts `.mjs` et les `vite.config.ts` sont couverts par `tsconfig.scripts.json` /
  `tsconfig.node.json` — ils ne l'étaient pas et n'étaient donc jamais typecheckés.

## Ce qui reste

1. **Back-office `/admin`** — pas commencé (ajout/édition de questions, import CSV,
   prévisualisation média). Le parsing CSV de `seed.ts` est réutilisable.
2. **Wrangler v3 → v4** — la v3 avertit qu'elle est dépassée. À faire au calme, ça touche la
   config qui déploie.
3. **Sons d'ambiance / musique** — pas fait.
4. **Plus d'audio** — 15 sons seulement, tous animaux/cuisine. Les images sont mieux
   loties depuis les tableaux (195 en deux familles). Relancer `sounds:fetch` demande une
   clé Freesound personnelle.

## Reprendre la main

```
pnpm install
pnpm dev                        # web sur :5173, server (wrangler --local) sur :8787
pnpm test                       # 121 tests
pnpm --filter server seed       # recharge la banque dans le D1 local
```

Chaîne de vérification avant de pousser :

```
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build
```

**La leçon la plus rentable de ce projet** : lancer une vraie partie dans un vrai
navigateur, à trois onglets. Compter les lignes en base ou constater que « ça compile » n'a
attrapé aucun des vrais bugs — questions image inatteignables, audio jamais tiré, matching
de chaîne faux positif, titres dupliqués. Tous trouvés en jouant.
