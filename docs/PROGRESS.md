# État d'avancement — nuit du 2026-09-05 au 2026-09-06 + journée du 2026-09-06

Travail fait en autonomie pendant que tu dormais, sans validation intermédiaire (voir
`DECISIONS.md` pour les choix tranchés à ta place : nom, couleur, découpage des phases).
Tout est commité dans git, un commit par étape logique — `git log --oneline` pour l'historique.

## Ajouts du 2026-09-06 (sur demande explicite, en session)

- **Scoring manuel par l'hôte** (remplace l'auto-validation/JUDGING du brief original) :
  les questions s'enchaînent sans attendre (dès que tout le monde a répondu, direct à la
  suivante, aucun écran REVEAL/SCOREBOARD entre elles). À la fin de la partie, nouvelle
  phase `HOST_REVIEW` (sans timer) : l'hôte note chaque réponse de chaque joueur à chaque
  question — Nul (0) / Presque (0.5) / Good (1) — visible en direct par tout le monde,
  score appliqué immédiatement et re-notable. Un vrai bug a été trouvé et corrigé au
  passage : le formulaire de réponse ne se réinitialisait plus entre deux questions
  (elles restent dans la même phase `QUESTION` maintenant) — corrigé en le re-montant
  par id de question. Limite de débit WS relevée (20→120 msg/10s) pour que l'hôte
  puisse noter beaucoup de réponses rapidement sans se faire silencieusement bloquer.
  Testé de bout en bout avec 2 clients WebSocket réels + vérification visuelle navigateur.
- **Layout** : blocs plus grands, centrés verticalement à l'écran (`max-w-2xl`,
  `justify-center`), inputs/boutons/lignes de joueurs agrandis.
- **Manche "téléphone dessiné"** (~2 questions sur 15) : nouvelle machine à états
  `CHAIN_PROMPT → CHAIN_DRAW → CHAIN_GUESS → CHAIN_REVEAL`, rotation à 3 maillons entre
  tous les joueurs connectés, scoring par comparaison texte (même moteur que les
  questions classiques). 8 nouveaux tests + smoke test réel à 3 clients WebSocket
  simultanés (rotation et scoring vérifiés en conditions réelles). Voir `CLAUDE.md`.
- **Refonte visuelle cyberpunk minimaliste** : palette néon cyan/magenta sur fond
  quasi-noir avec grille, typographies Space Grotesk + JetBrains Mono, boutons/inputs
  avec glow et micro-animations au hover, transitions d'entrée de phase.
- **Avatars** : set original de 12 visages en SVG (grands yeux, coiffures/expressions
  variées) remplaçant les emojis — pas d'images externes.
- **15 questions audio** (nouveaux thèmes `animaux` × 9, `cuisine` × 6) : sons courts CC0
  récupérés via l'API officielle de Freesound.org (clé perso requise, voir
  `apps/server/scripts/fetch-freesound.mjs`), compressés/uploadés via `pnpm media:add`,
  testés en conditions réelles (question tirée, média servi par `/media/:key`,
  content-type correct). **Pixabay écarté** : son bouton de téléchargement est protégé
  par un challenge anti-bot Cloudflare Turnstile — je n'ai pas essayé de l'automatiser.
  ⚠️ Les fichiers mp3 sources ne sont pas commités dans git (binaires, gitignore
  `apps/server/seed/downloads/`) — pour les régénérer : `FREESOUND_TOKEN=<ta clé>
  pnpm --filter server sounds:fetch` puis `pnpm --filter server media:add <fichier>`
  pour chacun, puis `pnpm --filter server seed seed/audio-questions.json`.
- **+160 questions texte**, portant la banque à **375 questions** sur **12 thèmes** :
  15 de plus sur chacun des 8 thèmes d'origine, + 2 nouveaux thèmes (`litterature` × 20,
  `technologie` × 20). Fichier `apps/server/seed/questions-batch2.json`.
- **Pas fait, sur demande explicite** : vrais openings d'anime / génériques de films en
  MP3. Ce sont des œuvres musicales protégées par le droit d'auteur (studios, labels) —
  contrairement aux bruitages CC0 ci-dessus, il n'existe pas de source légale gratuite
  pour de la vraie musique de licence commerciale. Je n'ai pas cherché à les scraper
  depuis YouTube ou des sources non autorisées. Si tu veux ce type de question, la voie
  légale est d'utiliser tes propres fichiers (médias que tu possèdes légalement, usage
  privé) via `pnpm media:add`, ou des pistes "inspirées de" libres de droits (pas les
  vrais titres) trouvables sur les mêmes plateformes CC0.

## Passe d'audit et corrections — 2026-09-06

Audit complet du projet puis correction de tout ce qu'il a remonté. **76 tests Vitest**
(53 avant), typecheck strict propre, et deux parties complètes jouées contre un
`wrangler dev` réel avec 3 clients WebSocket (12/12 puis 17/17 vérifications).

### Bugs corrigés

1. **Boucle de reconnexion infinie entre deux onglets.** Le DO fermait l'ancien socket
   avec le code 4002, mais le client se reconnectait sur *toute* fermeture : l'ancien
   onglet revenait, éjectait le nouveau, qui revenait, etc. La décision de reconnexion
   est maintenant une fonction pure testée (`decideOnClose` dans `ws-client.ts`) : on
   abandonne sur 4002 (autre onglet) et 4003 (kick).
2. **Impossible de revenir dans une room après en avoir rejoint une autre.** Le
   `playerToken` était une clé localStorage globale, écrasée à chaque nouvelle room ; le
   retour sur la première donnait `ERROR` + close 4001, donc (bug n°1) une boucle. L'identité
   est désormais **par room** (`nonoculture:playerId:<code>` / `:playerToken:<code>`), et un
   token refusé déclenche une nouvelle identité une seule fois au lieu d'être re-proposé
   en boucle.
3. **Une partie sans questions démarrait quand même** (banque non seedée, ou thème sans
   question) : `buildDeck` remplissait les slots avec `undefined` derrière un `!`, la
   partie tournait sur un écran vide. Le deck ne dépasse plus le nombre de questions
   réellement tirées, et `START_GAME` renvoie « Aucune question disponible pour ces
   thèmes. » au lieu de démarrer dans le vide.
4. **`HOST_KICK` ne kickait personne.** Le joueur était retiré de l'état mais son socket
   restait ouvert : un `HELLO` le faisait revenir aussitôt. Nouvel effet
   `CLOSE_PLAYER_SOCKETS` (close 4003). Et si l'hôte se kickait lui-même, `hostPlayerId`
   pointait sur un fantôme et la room devenait indirigeable — la main passe maintenant au
   plus ancien joueur connecté.
5. **Les rooms `FINISHED` n'étaient jamais nettoyées** : `computeNextAlarmTs` excluait
   cette phase du timeout d'inactivité, donc plus aucune alarme n'était planifiée et le
   storage du DO survivait indéfiniment. L'exclusion est levée.
6. **Une manche figeait si le dernier joueur attendu se déconnectait** — on attendait le
   timer complet (45 s en `CHAIN_DRAW`) alors que tous les joueurs restants avaient fini.
   `advanceIfStepComplete` réévalue l'étape à chaque changement d'effectif (déconnexion,
   kick), sans jamais faire défiler les phases d'une room vide.

### Points structurels

- **Les dessins sortent de `GameState`.** L'état entier est réécrit dans une seule valeur
  de storage à chaque transition et rediffusé à chaque socket : y garder des PNG base64
  réécrivait des centaines de Ko par soumission. `chain.drawings` ne garde qu'un booléen,
  les octets vivent dans des clés `chain:drawing:<originId>` (effets `STORE_CHAIN_DRAWING`
  / `CLEAR_CHAIN_DRAWINGS`, cache mémoire réhydraté dans le constructeur du DO).
- **Dessins compressés côté client** : WebP q0.7, repli JPEG pour les Safari sans encodeur
  WebP (`DrawingCanvas`), et le plafond protocole passe de 200 000 à 60 000 caractères
  (`MAX_DRAWING_DATA_URL_LENGTH`, partagé client/serveur) avec un contrôle de type MIME.
- **`buildDeck` ne charge plus toute la banque en mémoire** : `ORDER BY RANDOM() LIMIT ?`
  côté SQLite au lieu d'un `SELECT *` complet suivi d'un shuffle en JS (le brief vise 8000
  questions).
- **Matching de la manche chaîne réécrit** (`isChainMatch`). L'ancien seuil de distance
  globale à 0.15 refusait « chat qui danse » pour « un chat qui danse » ; simplement le
  desserrer faisait matcher « p2 qui danse » avec « host qui danse » (constaté en test
  réel). On compare maintenant les **mots significatifs** : les mots outils sont gratuits,
  chaque mot porteur doit être retrouvé.
- **Allocation de code de room atomique** : `INSERT ... ON CONFLICT DO UPDATE ... WHERE
  expires_at < ?` en une requête, au lieu d'un lire-puis-écrire où deux créations
  simultanées pouvaient obtenir le même code.
- **Rate limit WS par socket** au lieu d'un bucket `"anonymous"` partagé, qu'un seul client
  bruyant pouvait saturer pour bloquer les `HELLO` de tout le monde.
- **Questions média filtrées quand R2 n'est pas branché** : sans binding, `/media/:key`
  renvoie 404 et la question s'affichait avec un lecteur muet et aucun moyen de répondre.
  `buildDeck` les exclut tant que `env.MEDIA` est absent.
- **Nouveau `GET /api/themes`** : la banque locale n'a que 10 des 12 thèmes de l'interface
  (`animaux`/`cuisine` sont audio-only et jamais seedés). Le sélecteur de thèmes n'affiche
  plus que ceux qui ont réellement des questions jouables.
- **Seed idempotent** : migration `0002` (dédoublonnage + index unique sur
  `(prompt, answer)`, index `(verified, theme)`) et `INSERT OR IGNORE`. Re-seeder ne
  duplique plus la banque — vérifié, 360 questions avant et après.
- **CI GitHub Actions** (`.github/workflows/ci.yml`) : typecheck + tests + build web.

### ESLint + Prettier (ajoutés après coup)

- **Prettier** (`printWidth: 120`, aligné sur le style réel du code — p99 des lignes = 119,
  donc 576 lignes touchées seulement). `endOfLine: auto` pour ne pas convertir les CRLF du
  poste. Les `.md` sont exclus : la prose française est retaillée à la main, la reflower
  enterrerait les vrais diffs.
- **ESLint 10 en flat config** avec `typescript-eslint` **type-checked**, `react-hooks` et
  `react-refresh`. Règles durcies au-delà du recommandé : `no-explicit-any` en erreur (la
  règle du projet), `no-floating-promises` et `no-misused-promises` (une promesse lâchée
  dans le DO = une écriture de storage ou un broadcast perdu).
- `pnpm lint`, `pnpm lint:fix`, `pnpm format`, `pnpm format:check` ; les deux checks sont
  branchés en CI avant le typecheck.

**Ce que le lint a réellement trouvé** (tout corrigé, 0 erreur / 0 warning) :

- `levenshteinDistance` utilisait `new Array(n)`, typé `any[]` — ce qui **neutralisait
  `noUncheckedIndexedAccess`** dans la fonction la plus chaude du projet. Une fois typé
  `number[]`, TypeScript a sorti 3 accès non gardés.
- `blockConcurrencyWhile` non awaité dans le constructeur du DO, `JSON.parse` non typé sur
  les messages WebSocket (client et écran hôte), `navigate()` et `clipboard.writeText()`
  dont les promesses étaient lâchées.
- `setPlayerId` appelé directement dans un `useEffect` (`react-hooks/set-state-in-effect`) —
  code que j'avais écrit dans la passe précédente : rendu en cascade à chaque montage,
  remplacé par un ajustement pendant le rendu.
- Imports morts laissés par le refactor (`DeckItem`, `CHAIN_GUESS_DURATION_MS`).
- **Les scripts (`seed.ts`, `media-add.ts`) et `vite.config.ts` n'étaient couverts par aucun
  tsconfig, donc jamais typecheckés.** Deux configs dédiées
  (`apps/server/tsconfig.scripts.json`, `apps/web/tsconfig.node.json`) les rattachent, et
  `pnpm typecheck` les couvre désormais.
- Données d'avatars sorties de `Avatar.tsx` vers `lib/avatars.ts` : mélanger constantes et
  composant dans un module casse le Fast Refresh.

### Laissé de côté, volontairement

- **Le rate limit de création de room reste par isolate** (`createRoomLimiter` est un
  global de module dans le Worker, donc dupliqué à chaque isolate : la limite de 10/min/IP
  ne tient pas vraiment en prod). Le corriger proprement demande soit un DO dédié, soit le
  binding Rate Limiting de Cloudflare — ni l'un ni l'autre ne se teste en local, et ça
  engage la structure du projet. À trancher avant déploiement réel.
- ~~Pas d'ESLint/Prettier~~ — **fait dans un second temps** (voir ci-dessous).
- **Wrangler v3 → v4** toujours pas fait (avertissement à chaque `dev`).

## Ce qui marche, testé pour de vrai (pas juste "ça compile")

Testé à la fois par 53 tests Vitest **et** en conditions réelles (`wrangler dev` + navigateur
Chrome piloté, room jouée de bout en bout, capture d'écran à l'appui) :

- **Setup** — monorepo pnpm (`apps/web`, `apps/server`, `packages/shared`), TypeScript strict
  partout, Wrangler configuré, D1 + R2 (émulés en local, voir "Ce qu'il reste à faire").
- **Room & sockets** — création de room (code 4 chiffres via `POST /api/rooms`), jonction,
  salon temps réel, WebSocket Hibernation API (`ctx.acceptWebSocket`, restauration via
  `ctx.getWebSockets()`), ping/pong gratuit via `ctx.setWebSocketAutoResponse()` (le client
  envoie "PING" en texte brut toutes les 30s, la réponse "PONG" ne réveille pas le DO).
- **Boucle de jeu complète** — LOBBY → QUESTION → (chaîne) → HOST_REVIEW → FINISHED,
  entièrement dirigée par le serveur (Alarms API, aucun `setTimeout`/`setInterval` dans le DO).
  Jouée de bout en bout avec 3 clients WebSocket réels sur la banque locale.
- **Auto-validation des réponses** — normalisation (accents, articles, ponctuation) +
  Levenshtein normalisé, seuils 0.15/0.5, zone grise détectée correctement.
- **JUDGING** — vote de la room sur les réponses en zone grise, le concerné ne vote pas sur sa
  propre réponse, tie-break par le vote de l'hôte, timeout 10s géré par alarme.
- **Reconnexion (section 7 du brief, l'exigence prioritaire)** — `playerToken` généré et
  renvoyé au client via `HELLO_OK`, `STATE_SYNC` complet à la reconnexion, grâce de 5 min pour
  un joueur déconnecté (score conservé), migration automatique de l'hôte vers le plus ancien
  joueur connecté (sans retour automatique), détection de double onglet (ferme l'ancien socket),
  nettoyage de room après 30 min d'inactivité totale. Backoff exponentiel + jitter côté client
  (500ms → 10s plafonné). **Tout ça est testé** : 30 tests sur la machine à états pure +
  2 scénarios réels en navigateur (reconnexion, double onglet).
- **Client web** — React 19 + Vite + Tailwind v4, dark mode avec la palette et l'accent du
  brief, mobile-first (zones tactiles 44px), toutes les phases ont un écran : accueil, profil,
  lobby + réglages hôte, question + media, reveal, judging, scoreboard, podium final, écran
  hôte `/room/:code/screen` en mode spectateur pur (ne rejoint jamais la partie comme joueur —
  point de conception important, voir `RoomDO.ts` message `OBSERVE`).
- **Banque de questions** — 200 questions vérifiées, 25 par thème sur les 8 thèmes du brief,
  chargées dans D1 local via `pnpm --filter server seed`.
- **Médias** — route `GET /media/:key` qui sert R2, script `pnpm --filter server media:add`
  qui compresse via ffmpeg (images WebP ≤1280px, audio MP3 128kbps ≤20s, vidéo H264 720p ≤15s
  sans audio) et upload sur R2, préchargement du média de la question suivante pendant le
  SCOREBOARD (`MediaPreloader` dans `Room.tsx`). **Non testé avec un vrai fichier** — aucune
  question de la banque n'a de média pour l'instant, tout est `type: "text"`.
- **Qualité** — TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
  zéro `any`, sanitize des pseudos/réponses, rate limiting simple (création de room, messages
  WS par connexion), cas dégénérés couverts par les tests (1 joueur, personne ne répond, tout
  le monde déconnecté).

## Ce qu'il reste à faire

1. **Compte Cloudflare réel** — rien n'est déployé, tout tourne en émulation locale (Miniflare).
   Au réveil : `wrangler login`, puis `wrangler d1 create quiproquo-db` et
   `wrangler r2 bucket create quiproquo-media`, remplacer le `database_id` placeholder dans
   `apps/server/wrangler.toml`, relancer `pnpm --filter server db:migrate:local` en `--remote`,
   reseed en remote (`pnpm --filter server seed -- --remote`).
2. **Assets Workers** — fait. Le bloc `[assets]` est actif et `pnpm --filter server dev` crée
   un `apps/web/dist/index.html` placeholder au démarrage (`scripts/ensure-assets.mjs`) pour que
   wrangler démarre sur un clone frais ; `pnpm --filter web build` l'écrase par le vrai front.
3. **Back-office `/admin`** (phase 7 du brief) — pas commencé. Prévu : ajout/édition/suppression
   de questions, import CSV (le script `seed.ts` sait déjà lire un CSV, la logique de parsing
   est réutilisable), marquer vérifié, prévisualiser le média.
4. **Polish (phase 8)** — animations actuelles = transitions CSS simples (`transition-all
   duration-200/500`), pas la librairie **Motion** mentionée dans le brief. Fonctionnel et
   respecte `prefers-reduced-motion`, mais moins soigné que ce que decrit la section 10.
   Sons d'ambiance : pas fait.
5. **Wrangler v3 → v4** — `wrangler dev` avertit que la version est dépassée
   (`npm install --save-dev wrangler@4`). Pas mis à jour cette nuit pour ne pas risquer de
   casser une config qui marche sans supervision ; à faire au calme.
7. **Vraie banque de 8000 questions** — le brief est explicite là-dessus, c'est à toi de la
   remplir par lots via le script `pnpm seed` (JSON ou CSV) ou le futur back-office.
8. **Médias réels** — aucun fichier image/audio/vidéo n'existe encore ; `media-add.ts` n'a
   jamais tourné sur un vrai fichier (ffmpeg installé cette nuit mais pas exercé).

## Comment reprendre la main demain matin

```
pnpm install                      # si besoin
pnpm --filter server dev          # wrangler dev --local, sur :8787
pnpm --filter web dev             # vite, sur :5173, proxy /api vers :8787
pnpm test                         # 53 tests, tous verts
```

Ouvre `http://localhost:5173`, "Créer une partie", et c'est jouable immédiatement avec la vraie
banque de 200 questions.
