# État d'avancement — nuit du 2026-09-05 au 2026-09-06

Travail fait en autonomie pendant que tu dormais, sans validation intermédiaire (voir
`DECISIONS.md` pour les choix tranchés à ta place : nom, couleur, découpage des phases).
Tout est commité dans git, un commit par étape logique — `git log --oneline` pour l'historique.

## Ce qui marche, testé pour de vrai (pas juste "ça compile")

Testé à la fois par 53 tests Vitest **et** en conditions réelles (`wrangler dev` + navigateur
Chrome piloté, room jouée de bout en bout, capture d'écran à l'appui) :

- **Setup** — monorepo pnpm (`apps/web`, `apps/server`, `packages/shared`), TypeScript strict
  partout, Wrangler configuré, D1 + R2 (émulés en local, voir "Ce qu'il reste à faire").
- **Room & sockets** — création de room (code 4 chiffres via `POST /api/rooms`), jonction,
  salon temps réel, WebSocket Hibernation API (`ctx.acceptWebSocket`, restauration via
  `ctx.getWebSockets()`), ping/pong gratuit via `ctx.setWebSocketAutoResponse()` (le client
  envoie "PING" en texte brut toutes les 30s, la réponse "PONG" ne réveille pas le DO).
- **Boucle de jeu complète** — LOBBY → QUESTION → REVEAL → JUDGING → SCOREBOARD → QUESTION/FINISHED,
  entièrement dirigée par le serveur (Alarms API, aucun `setTimeout`/`setInterval` dans le DO).
  Jouée de bout en bout dans un vrai navigateur avec les 200 questions de la banque réelle.
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
2. **Assets Workers** — le bloc `[assets]` de `wrangler.toml` est commenté (sinon `wrangler dev`
   refuse de démarrer tant que `apps/web/dist` n'existe pas). Une fois `pnpm --filter web build`
   fait, décommenter pour servir le front depuis le même Worker en prod.
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
