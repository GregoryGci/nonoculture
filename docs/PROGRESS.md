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
| text        | text  | 3527 |
| number      | text  |  561 |
| list        | text  |  705 |
| text        | image |   90 |
| text        | audio |   15 |
| **total**   |       | 4898 |

Réparties sur **21 familles** (`family`), la plus grosse à 345 questions. La colonne
`family` existe pour une raison précise : sans elle, choisir le thème « sport » sortait
quinze fois « quel sport pratique X ? » d'affilée. Le tirage fait maintenant un round-robin
entre familles (`diversify()` dans `apps/server/src/lib/questions.ts`).

Générateurs (tous relançables, tous sur des sources CC0) :

- `apps/server/scripts/generate-questions.mjs` — 16 familles depuis **Wikidata** (SPARQL,
  CC0). Difficulté calculée en **rang percentile à l'intérieur de la famille**, pas par
  seuil absolu : tous les pays ont un nombre de sitelinks proche, un seuil fixe classait
  Avarua en « facile ».
- `apps/server/scripts/generate-lists.mjs` — 705 questions « citez… » (~22 réponses
  acceptées chacune), la matière première des duels.
- `apps/server/scripts/fetch-freesound.mjs` — sons CC0 via l'API Freesound (clé perso,
  passée en variable d'environnement, jamais écrite sur disque).
- Les images (drapeaux) passent par une vérification de licence **fichier par fichier** via
  l'API Commons, pas au niveau du site.

## Modes de jeu

Le deck mélange des questions ordinaires et des manches spéciales, chacune réglable par
l'hôte dans le lobby (`GameSettings`, `HostSettings.tsx`) :

| Réglage         | Défaut | Effet                                                        |
| --------------- | -----: | ------------------------------------------------------------ |
| `questionCount` |     20 | 5 à 40 slots au total                                        |
| `chainRounds`   |      1 | manches « téléphone dessiné »                                |
| `bluffRounds`   |      1 | manches bluff                                                |
| `duelRounds`    |      1 | duels 1v1                                                    |
| `numericRounds` |      2 | questions « le plus proche gagne »                           |

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
- **Qualité** : ESLint + Prettier + CI, TypeScript strict sans `any`, **91 tests** Vitest.
  Les scripts `.mjs` et les `vite.config.ts` sont couverts par `tsconfig.scripts.json` /
  `tsconfig.node.json` — ils ne l'étaient pas et n'étaient donc jamais typecheckés.

## Ce qui reste

1. **Back-office `/admin`** — pas commencé (ajout/édition de questions, import CSV,
   prévisualisation média). Le parsing CSV de `seed.ts` est réutilisable.
2. **Wrangler v3 → v4** — la v3 avertit qu'elle est dépassée. À faire au calme, ça touche la
   config qui déploie.
3. **Sons d'ambiance / musique** — pas fait.
4. **Plus de médias** — 15 audio et 90 images, c'est peu face à 4 800 questions texte.

## Reprendre la main

```
pnpm install
pnpm dev                        # web sur :5173, server (wrangler --local) sur :8787
pnpm test                       # 91 tests
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
