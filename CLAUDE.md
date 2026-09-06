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
- Aucune réponse d'un joueur ne doit être diffusée aux autres avant la phase `REVEAL`
  (sinon triche via l'inspecteur réseau). `ANSWER_RECEIVED` est un accusé sans contenu.
- Le DO persiste son état dans son storage SQLite après **chaque** transition de phase.
- TypeScript strict partout, pas de `any`. Types du protocole WS et schémas Zod dans
  `packages/shared`, importés par le client et le serveur — jamais dupliqués.

## Machine à états (dans `apps/server/src/room/`)

```
LOBBY → QUESTION → REVEAL → JUDGING → SCOREBOARD → (QUESTION | FINISHED)
```

`JUDGING` est sauté si aucune réponse n'est en zone grise après l'auto-validation
(Levenshtein normalisé ≤ 0.15 = validé auto, très éloigné = refusé auto). Détail complet
dans `docs/brief.md` section 6.

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
