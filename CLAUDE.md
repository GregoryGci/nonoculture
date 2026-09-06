# Quiproquo — quiz party game multijoueur

Party game de quiz en temps réel, réponses libres (pas de QCM), jouable entre amis sans
compte. Brief original : `docs/brief.md`. Décisions prises en autonomie (nom, couleur) :
`DECISIONS.md`. État d'avancement à jour : `docs/PROGRESS.md` — **toujours le lire en
premier** en reprenant ce projet, c'est la source de vérité sur ce qui est fait/en cours.

## Stack (100% free tier, zéro dépendance payante)

- Runtime serveur : **Cloudflare Workers** + **Hono**
- État temps réel : **Durable Objects** (1 DO = 1 room), storage SQLite intégré
- Banque de questions : **Cloudflare D1**
- Médias : **Cloudflare R2**
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
LOBBY → QUESTION → (QUESTION suivante | CHAIN_PROMPT | HOST_REVIEW) → FINISHED
```

Dès que tous les joueurs connectés ont répondu (ou que le timer expire), on enchaîne
directement sur le slot suivant du deck — **aucun `REVEAL` ni `SCOREBOARD` entre les
questions**, pour rester fluide. Chaque réponse est archivée (`GameState.answerLog`,
par index de deck) pendant toute la partie. Une fois le deck épuisé, la partie passe en
`HOST_REVIEW` (pas de timer, `phaseDeadlineTs: null`) : l'hôte note chaque réponse de
chaque joueur à chaque question via `SUBMIT_HOST_GRADE` (Nul=0 / Presque=0.5 / Good=1),
visible en lecture seule par tout le monde pour la transparence ; le score est appliqué
immédiatement et peut être corrigé (re-noter écrase l'ancienne note, pas de cumul). Le
host clique "Voir le podium" (`HOST_NEXT`) quand il a fini pour passer à `FINISHED`.

Le deck (`GameState.deck`) mélange des questions trivia et des manches "téléphone
dessiné" (~2 sur 15 slots, voir `apps/server/src/lib/questions.ts#buildDeck`), qui
gardent elles leur scoring automatique :

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
pnpm --filter server seed # charge apps/server/seed/questions.json dans D1 local
pnpm --filter server media:add <fichier>  # compresse (ffmpeg) + upload R2
```

Tout tourne en local (Miniflare) tant que `wrangler login` n'a pas été fait — voir
`DECISIONS.md` pour le détail de ce qui reste à connecter à un vrai compte Cloudflare.

## Conventions de code

- Sanitize systématiquement pseudos (max 16 caractères, pas de HTML) et réponses
  affichées côté serveur avant broadcast — jamais de confiance dans l'input client.
- Chaque message WS entrant est validé par un schéma Zod avant traitement ; un message
  invalide renvoie `ERROR` et est ignoré, jamais de throw non catché dans le DO.
- Tests Vitest obligatoires sur : normalisation des réponses, calcul des scores, machine
  à états du DO (ce sont les trois zones où un bug est le plus coûteux).
- Pas de nom/logo/contenu d'un jeu commercial existant, ce projet s'inspire d'un format,
  pas d'un produit.
