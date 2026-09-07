# Nono Culture — quiz party game multijoueur

Party game de quiz en temps réel, réponses libres (pas de QCM), jouable entre amis sans
compte. Brief original : `docs/brief.md`. Décisions prises en autonomie (nom, couleur) :
`DECISIONS.md`. État d'avancement à jour : `docs/PROGRESS.md` — **toujours le lire en
premier** en reprenant ce projet, c'est la source de vérité sur ce qui est fait/en cours.

## Stack (100% free tier, zéro dépendance payante)

- Runtime serveur : **Cloudflare Workers** + **Hono**
- État temps réel : **Durable Objects** (1 DO = 1 room), storage SQLite intégré
- Banque de questions : **Cloudflare D1**
- Médias et front buildé : **Workers Static Assets** (binding `ASSETS`). **Pas de R2** —
  l'activer demande une carte bancaire, décision explicite de ne pas en dépendre. Le bloc
  `[[r2_buckets]]` reste commenté dans `wrangler.toml` ; le code teste `mediaAvailable` et
  se passe des médias si rien n'est disponible.
- Front : **React 19 + Vite + TypeScript + Tailwind v4**
- Monorepo : **pnpm workspaces** (`apps/web`, `apps/server`, `packages/shared`)

## Règles d'architecture non négociables

- **Le serveur est autoritaire.** Le client n'affiche que ce que le DO lui envoie.
  Aucun score, timer ou validation de réponse calculé côté client — juste de l'affichage
  d'un état reçu.
- **Un DO par room**, adressé par `idFromName(roomCode)`.
- **WebSocket Hibernation API obligatoire** : `ctx.acceptWebSocket()`, jamais
  `ws.accept()`. Restaurer les sockets dans le constructeur du DO via
  `ctx.getWebSockets()`, ne jamais garder d'état de connexion en dehors de ça.
- **Aucun `setTimeout`/`setInterval` dans le DO** : tous les timers passent par
  l'**Alarms API** (`ctx.storage.setAlarm()` / `alarm()` handler), sinon l'hibernation
  est bloquée et le DO facture du compute inutilement.
- `ctx.setWebSocketAutoResponse()` pour le ping/pong (gratuit, ne réveille pas le DO).
- Aucune réponse d'un joueur ne doit être diffusée aux autres avant `HOST_REVIEW`
  (sinon triche via l'inspecteur réseau). `ANSWER_RECEIVED` est un accusé sans contenu.
- Le DO persiste son état dans son storage SQLite après **chaque** transition de phase.
- TypeScript strict partout, pas de `any`. Types du protocole WS et schémas Zod dans
  `packages/shared`, importés par le client et le serveur — jamais dupliqués.

## Machine à états (dans `apps/server/src/room/`)

**Le scoring des questions texte est 100% manuel, décidé par l'hôte à la fin de la
partie — pas d'auto-validation Levenshlein/JUDGING pour ces questions** (changement
demandé en session, remplace l'auto-validation décrite dans `docs/brief.md` section 6).
Le seul scoring automatique restant est celui de la manche chaîne, via `isChainMatch`
(`packages/shared/src/answer-validation.ts`).

```
LOBBY → QUESTION → (QUESTION suivante | manche spéciale | HOST_REVIEW) → FINISHED
```

Deux exceptions à ce scoring manuel, toutes deux automatiques parce qu'il n'y a rien à
juger — c'est de l'arithmétique ou du comptage, pas du jugement :

- `answer_kind = "number"` : scoré par proximité (le plus proche gagne). Ces réponses sont
  **exclues d'`answerLog`**, donc l'hôte ne les voit pas en review.
- `answer_kind = "list"` : la question porte tout son ensemble de réponses acceptées dans
  `answer` + `aliases`, et la manche duel compte les touches.

Dès que tous les joueurs connectés ont répondu (ou que le timer expire), on enchaîne
directement sur le slot suivant du deck — **aucun `REVEAL` ni `SCOREBOARD` entre les
questions**, pour rester fluide. Chaque réponse est archivée (`GameState.answerLog`,
par index de deck) pendant toute la partie. Une fois le deck épuisé, la partie passe en
`HOST_REVIEW` (pas de timer, `phaseDeadlineTs: null`) : l'hôte note chaque réponse de
chaque joueur à chaque question via `SUBMIT_HOST_GRADE` (Nul=0 / Presque=0.5 / Good=1).
**La liste de correction est envoyée à toute la room**, mais seul l’hôte peut noter :
`SUBMIT_HOST_GRADE` et `HOST_REVIEW_GOTO` sont refusés pour tout le monde sauf lui. Elle a été
host-only un temps, avec les autres joueurs sur un podium provisoire — ce qui obligeait l’hôte
à partager son écran pour que la room suive quoi que ce soit. La carte affichée vit dans
`GameState.reviewIndex` et non dans le state local du panneau : sinon chaque client pagine de
son côté et personne ne suit personne. Le score est appliqué immédiatement et peut être corrigé
(re-noter écrase l’ancienne note, pas de cumul). L’hôte clique "Voir le podium" (`HOST_NEXT`)
quand il a fini, pour passer à `FINISHED`.

Le deck (`GameState.deck`) est composé à partir des **compteurs choisis par l'hôte**
(`chainRounds`, `bluffRounds`, `duelRounds`, `numericRounds` dans `GameSettings`), plus un
quota d'audio calculé sur la longueur. Chaque manche spéciale consomme un slot de
`questionCount`, et n'est jamais placée en première ni en dernière position. Ordre de
tirage dans `buildDeck` : bluff et duel d'abord (ils ont besoin d'une question à eux, et
le duel exige une question liste qui peut ne pas exister pour les thèmes choisis), puis
numérique, puis audio, puis le reste — pour que le nombre de slots se réduise à ce que la
banque sait fournir au lieu de produire des questions vides.

**Diversité du tirage.** Chaque question porte une colonne `family` (le gabarit qui l'a
produite). `fetchQuestions` sur-tire (`limit × 6`) puis `diversify()` fait un round-robin
entre familles. Sans ça, choisir le thème « sport » sortait quinze fois « quel sport
pratique X ? » d'affilée — c'est le bug qui a motivé la colonne.

`buildDeck` transmet en plus à chaque tirage l’ensemble des ids déjà placés. Les manches de
bluff et les questions ordinaires puisent dans le même vivier, et deux `ORDER BY RANDOM()`
indépendants renvoyaient volontiers la même ligne : la partie posait une question, puis
demandait d’inventer une fausse réponse à cette même question. Couvert par
`apps/server/src/lib/questions.test.ts`.

Chaque manche spéciale est sautée si la room compte moins de 3 joueurs connectés au moment
où son slot arrive (`CHAIN_MIN_PLAYERS`, `BLUFF_MIN_PLAYERS`, `DUEL_MIN_PLAYERS`).

```
BLUFF_WRITE (45s) → BLUFF_VOTE (30s) → BLUFF_REVEAL (12s)
DUEL_PREDICT (15s) → DUEL_ANSWER (45s) → DUEL_REVEAL (12s)
```

- **Bluff** : chacun invente une fausse réponse, puis vote pour celle qu'il croit vraie.
  `BLUFF_POINTS_FOUND` si tu trouves, `BLUFF_POINTS_FOOLED` par joueur piégé par ton faux.
  Un faux identique à la vraie réponse est écarté (sinon elle s'afficherait deux fois), et
  voter pour sa propre option est refusé côté serveur. **L'auteur d'une option n'est jamais
  envoyé au client avant `BLUFF_REVEAL`** — même règle anti-triche que les réponses.
- **Duel** : deux joueurs tirés au sort s'affrontent sur une question liste, les autres
  parient sur le gagnant avant le départ. Chaque item valide compte une fois, quel que soit
  le nombre de fois où il est tapé. `DUEL_POINTS_WINNER` au vainqueur,
  `DUEL_POINTS_PREDICTED` à chaque spectateur qui a vu juste ; un duelliste ne peut pas
  parier sur lui-même.

Les manches dessinées gardent leur scoring automatique :

```
CHAIN_PROMPT → CHAIN_DRAW → CHAIN_GUESS → CHAIN_REVEAL → (slot suivant du deck)
```

Tous les joueurs connectés sont pris en rotation (`GameState.chain.order`, snapshotté au
lancement) : chacun écrit un prompt, dessine le prompt du joueur précédent, puis devine le
dessin du joueur encore avant — 3 chaînes de longueur 3 tournent en parallèle. Sauté si
moins de 3 joueurs sont connectés à ce moment (`CHAIN_MIN_PLAYERS`). Scoring : la
proposition finale est comparée au prompt d'origine par `isChainMatch`, qui compare les
**mots significatifs** et non une distance globale (sur des phrases libres, une distance
seule fait matcher « p2 qui danse » avec « host qui danse ») ; si ça matche, origine +
dessinateur + devineur touchent chacun `CHAIN_POINTS`. Voir `state-machine.ts`
(`originForRole`, `resolveChain`) et ses tests pour la logique de rotation.

**Les dessins ne sont jamais stockés dans `GameState`** : `chain.drawings` ne garde qu'un
booléen « a soumis », les octets vivent dans des clés de storage séparées du DO
(`chain:drawing:<originId>`, via les effets `STORE_CHAIN_DRAWING` / `CLEAR_CHAIN_DRAWINGS`).
L'état complet est réécrit dans une seule valeur de storage à chaque transition : y laisser
des images base64 réécrirait des centaines de Ko par soumission et dépasserait la limite
par valeur.

## Commandes

```
pnpm install              # à la racine, installe tout le monorepo
pnpm dev                  # lance web (vite) + server (wrangler dev --local) en parallèle
pnpm test                 # vitest sur tous les packages
pnpm lint / pnpm typecheck / pnpm format   # ESLint, tsc, Prettier
pnpm --filter server seed          # charge les seed/*.json dans D1 local
pnpm --filter server seed -- --remote  # idem sur le D1 de production
pnpm --filter server media:add <fichier>  # compresse (ffmpeg) vers apps/web/public/media
pnpm --filter web build && pnpm --filter server deploy   # déploie (front + worker)
```

Avant de pousser, la chaîne complète :
`pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build`.

Le compte Cloudflare est connecté et le Worker est déployé ; `pnpm dev` reste en local
(Miniflare) avec son propre D1. `docs/PROGRESS.md` donne l'état exact de la prod.

**Le déploiement dépend du build front** : `[assets]` pointe sur `apps/web/dist`, donc un
`wrangler deploy` sans `pnpm --filter web build` préalable met en ligne l'ancien front (ou
refuse de démarrer si le dossier manque).

## Conventions de code

- Sanitize systématiquement pseudos (max 16 caractères, pas de HTML) et réponses
  affichées côté serveur avant broadcast — jamais de confiance dans l'input client.
- Chaque message WS entrant est validé par un schéma Zod avant traitement ; un message
  invalide renvoie `ERROR` et est ignoré, jamais de throw non catché dans le DO.
- Tests Vitest obligatoires sur : normalisation des réponses, calcul des scores, machine
  à états du DO (ce sont les trois zones où un bug est le plus coûteux).
- Pas de nom/logo/contenu d'un jeu commercial existant, ce projet s'inspire d'un format,
  pas d'un produit.
