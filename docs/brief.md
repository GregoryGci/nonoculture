# Brief projet — Party game de quiz multijoueur en ligne

Tu vas construire un jeu de quiz multijoueur en temps réel, jouable entre amis depuis un
navigateur, sans création de compte. Lis tout le brief avant d'écrire une ligne de code, puis
propose-moi ton plan et attends ma validation avant de commencer la phase 1.

---

## 1. Le jeu en une phrase

Une partie = 20 à 40 questions de culture générale à **réponse libre** (le joueur tape sa
réponse, ce n'est pas un QCM). Après chaque question, tout le monde voit les réponses de tous
les joueurs, ce qui fait 80% du fun. Les points vont de 1 à 3 selon la difficulté de la question.

---

## 2. Stack imposée (tout doit rester dans le free tier)

| Brique | Choix | Rôle |
|---|---|---|
| Runtime serveur | Cloudflare Workers | Routing HTTP, API |
| État temps réel | Durable Objects (1 DO = 1 room) | Serveur de jeu autoritaire |
| Banque de questions | Cloudflare D1 (SQLite) | 8000+ questions |
| Médias | Cloudflare R2 | Images, audio, vidéos |
| Front | React 19 + Vite + TypeScript + Tailwind v4 | Client |
| Hébergement front | Cloudflare Workers Assets | Static |
| Outillage | Wrangler, Hono côté Worker | |

**Zéro dépendance payante. Pas de Vercel, pas de Supabase, pas de Firebase.**

---

## 3. Architecture

```
Navigateur (React)
    │  HTTP  → Worker (Hono) : créer room, rejoindre, API back-office
    │  WS    → Durable Object "Room" : tout le temps réel
                    │
                    ├── Storage SQLite du DO : état de la partie (source de vérité)
                    ├── D1 : pioche des questions au démarrage de la partie
                    └── R2 : URLs signées ou publiques des médias
```

Règles d'architecture non négociables :

- **Le serveur est autoritaire.** Le client n'affiche que ce que le DO lui envoie. Aucun score,
  aucun timer, aucune validation de réponse calculés côté client.
- **Un DO par room**, adressé par `idFromName(codeRoom)`.
- **WebSocket Hibernation API obligatoire** (`ctx.acceptWebSocket()`, pas `ws.accept()`), sinon
  le DO facture du temps de compute tant qu'un socket est ouvert. Restaure les sockets dans le
  constructeur via `ctx.getWebSockets()`.
- **Aucun `setTimeout` / `setInterval` dans le DO** : tous les timers passent par l'**Alarms API**,
  sinon l'hibernation est bloquée.
- Utilise `ctx.setWebSocketAutoResponse()` pour le ping/pong, ces messages sont gratuits.

---

## 4. Parcours utilisateur

1. Page d'accueil : deux boutons, **Créer une partie** / **Rejoindre**.
2. Créer → l'hôte choisit un pseudo + un avatar (emoji ou couleur, pas d'upload), atterrit dans
   le salon avec un **code à 4 chiffres** bien visible et un bouton "Copier le lien".
3. Rejoindre → soit on tape le code, soit on ouvre directement `/join/4821` et on n'a plus qu'à
   entrer son pseudo.
4. L'hôte règle la partie (nombre de questions, durée par question, thèmes activés) et lance.
5. La partie se joue. Le classement final affiche un podium.

Aucun compte, aucun email, aucun mot de passe. Un joueur = un `playerId` UUID en localStorage.

**Gestion des codes** : 4 chiffres, tirés aléatoirement parmi les codes non utilisés par une
room active. Un code est libéré 30 min après la fin de la partie. Si le pool est saturé
(improbable), bascule sur 5 chiffres.

---

## 5. Machine à états d'une partie

Le DO ne peut être que dans un de ces états. Chaque transition est déclenchée soit par une
alarme, soit par une action de l'hôte, jamais par un client lambda.

```
LOBBY → QUESTION → REVEAL → JUDGING → SCOREBOARD → (QUESTION | FINISHED)
```

- **LOBBY** — Les joueurs arrivent, l'hôte configure et lance.
- **QUESTION** — Énoncé + média affichés, timer serveur (15 à 30s selon réglage). Chaque joueur
  tape sa réponse et l'envoie. Une réponse envoyée est verrouillée. Si tout le monde a répondu
  avant la fin du timer, on passe directement à la suite.
- **REVEAL** — On affiche la bonne réponse et **la liste de toutes les réponses des joueurs**,
  avec leur pseudo. C'est le moment fort du jeu, soigne l'animation.
- **JUDGING** — Voir section 6.
- **SCOREBOARD** — Classement mis à jour, animation de progression des barres. 5s, ou l'hôte
  enchaîne.
- **FINISHED** — Podium, récap des meilleures/pires réponses, bouton "Rejouer" qui recycle la
  room avec les mêmes joueurs.

---

## 6. Validation des réponses libres (le point délicat)

Pipeline en deux temps :

**a) Auto-validation.** Pour chaque réponse, normalise (minuscules, suppression des accents,
ponctuation, articles initiaux `le/la/les/l'/un/une/the`, espaces multiples) puis compare à la
réponse attendue **et** à sa liste d'alias stockée en base. Si la distance de Levenshtein
normalisée est ≤ 0.15, c'est validé automatiquement. Si c'est très éloigné, c'est refusé
automatiquement.

**b) Vote de la room.** Toutes les réponses en zone grise (ni clairement bonnes, ni clairement
fausses) passent en phase JUDGING : elles sont affichées une par une, et les joueurs votent
"valide / pas valide" à la majorité. Le joueur concerné ne vote pas sur sa propre réponse.
L'hôte a un droit de trancher en cas d'égalité. Timer de 10s par vote, sans réponse = abstention.

Si aucune réponse n'est en zone grise, on saute JUDGING.

---

## 7. Reconnexion et robustesse (exigence prioritaire)

C'est la partie que je veux la plus solide. Implémente tout ceci :

- Le client stocke `{ playerId, playerToken, roomCode }` en localStorage. Le token est un secret
  généré par le serveur à la première connexion, il empêche d'usurper le slot d'un autre joueur.
- Au `open` du WebSocket, le client envoie `HELLO { playerId, playerToken, roomCode }`. Le serveur
  répond par un **`STATE_SYNC` contenant l'intégralité de l'état visible** : phase courante,
  question, temps restant calculé côté serveur, scores, liste des joueurs, réponse déjà soumise
  ou non. Le client se reconstruit entièrement à partir de ce message. Il ne doit exister aucun
  chemin de code où le client devine son état.
- Reconnexion automatique avec **backoff exponentiel** (500ms, 1s, 2s, 4s, plafonné à 10s) et
  jitter. Bandeau discret "Reconnexion…" pendant ce temps, sans jamais éjecter l'utilisateur de
  l'écran de jeu.
- Un joueur déconnecté reste dans la partie, affiché en grisé, pendant **5 minutes**. Ses points
  sont conservés. Passé ce délai, il est retiré.
- **Si l'hôte se déconnecte**, la partie continue. Les droits d'hôte passent automatiquement au
  joueur connecté le plus ancien. Si l'hôte d'origine revient, il ne les récupère pas
  automatiquement (évite les allers-retours).
- Chaque question a une deadline serveur en timestamp absolu. Le client affiche un compte à rebours
  local resynchronisé à chaque `STATE_SYNC` : jamais de dérive.
- Le DO persiste son état dans son storage SQLite après chaque transition de phase, pour survivre
  à une éviction.
- Détection de double onglet : si le même `playerId` ouvre une seconde connexion, ferme la
  première proprement.

---

## 8. Protocole WebSocket

JSON, avec un champ `type`. Définis les types côté TS dans un package partagé entre client et
serveur, et fais valider chaque message entrant par Zod.

Client → serveur : `HELLO`, `SET_PROFILE`, `START_GAME`, `SUBMIT_ANSWER`, `CAST_JUDGE_VOTE`,
`HOST_NEXT`, `HOST_KICK`, `HOST_SETTINGS`, `PLAY_AGAIN`.

Serveur → client : `STATE_SYNC`, `PHASE_CHANGE`, `PLAYER_JOINED`, `PLAYER_LEFT`,
`ANSWER_RECEIVED` (juste un accusé, sans dévoiler le contenu), `REVEAL_ANSWERS`, `JUDGE_PROMPT`,
`SCORE_UPDATE`, `GAME_OVER`, `ERROR`.

Aucune réponse d'un joueur ne doit transiter vers les autres clients avant la phase REVEAL, sinon
il suffit d'ouvrir l'inspecteur pour tricher.

---

## 9. Banque de questions

Schéma D1 :

```sql
CREATE TABLE questions (
  id            INTEGER PRIMARY KEY,
  theme         TEXT NOT NULL,      -- histoire, geo, sciences, cinema, musique, gaming, sport, insolite...
  difficulty    INTEGER NOT NULL,   -- 1 = facile (1pt), 2 = moyen (2pts), 3 = difficile (3pts)
  type          TEXT NOT NULL,      -- text, image, audio, video
  prompt        TEXT NOT NULL,
  media_key     TEXT,               -- clé R2, null si type = text
  answer        TEXT NOT NULL,
  aliases       TEXT NOT NULL,      -- JSON array de variantes acceptées
  explanation   TEXT,               -- affiché au REVEAL
  source        TEXT,
  verified      INTEGER DEFAULT 0
);
CREATE INDEX idx_theme_diff ON questions(theme, difficulty);
```

**Ne tente pas de générer 8000 questions.** Livre-moi :
- un jeu de **200 questions de test** propres et vérifiées pour développer,
- un script `pnpm seed` qui charge un CSV/JSON dans D1,
- un **back-office minimal** protégé par un secret d'env, à `/admin` : ajouter, éditer,
  supprimer, importer un CSV, marquer une question comme vérifiée, prévisualiser le média.

Je remplirai la base par lots ensuite.

**Contraintes médias (R2 gratuit = 10 Go, à respecter absolument) :**
- images en WebP, largeur max 1280px, < 200 Ko
- audio en Opus ou MP3 128 kbps, ≤ 20 secondes
- vidéo en MP4 h264 720p, ≤ 15 secondes, < 3 Mo, sans piste audio si inutile
- écris un script `pnpm media:add <fichier>` qui compresse via ffmpeg puis upload sur R2
- le client **précharge le média de la question suivante** pendant le SCOREBOARD, pour qu'il n'y
  ait jamais d'attente au moment d'afficher la question

---

## 10. Direction artistique

Dark mode par défaut, pensé pour être joué le soir. Sobre et moderne, pas de néon criard, pas de
dégradés partout.

- Fond `#0B0D12`, surfaces `#151922`, bordures `#232936`, texte `#E8EAF0`, texte secondaire `#8B93A7`
- **Une seule** couleur d'accent forte, utilisée avec parcimonie (timer, bouton principal, joueur
  en tête). Propose-moi 2 ou 3 options avant de trancher.
- Typo : une sans-serif géométrique lisible, graisses 400/600/800. Les chiffres de score en
  tabular-nums pour éviter que ça saute.
- Rayons 12-16px, ombres très douces, pas de bordure blanche.
- Animations : Motion, courtes (150-250ms), sur les transitions de phase, l'apparition des réponses
  au REVEAL et les barres du scoreboard. Rien qui ralentisse le rythme du jeu.
- Respecte `prefers-reduced-motion`.

**Mobile-first.** En vrai mes potes joueront sur leur téléphone. Le champ de réponse doit rester
visible clavier ouvert, les zones tactiles font 44px minimum.

**Mode "écran hôte"** en bonus : une vue `/room/4821/screen` pensée pour être affichée sur une TV
ou partagée en visio, qui montre la question en grand et le classement, pendant que chacun répond
sur son téléphone.

---

## 11. Ordre de construction

Ne code pas tout d'un bloc. Suis ces phases, et arrête-toi à la fin de chacune pour que je teste.

1. **Setup** — Monorepo pnpm (`apps/web`, `apps/server`, `packages/shared`), Wrangler configuré,
   D1 et R2 créés, un "hello world" déployé.
2. **Room & sockets** — Créer/rejoindre une room, salon avec liste de joueurs en temps réel,
   codes à 4 chiffres, liens d'invitation. Pas encore de jeu.
3. **Boucle de jeu jouable** — Questions texte uniquement, cycle complet
   QUESTION → REVEAL → SCOREBOARD, auto-validation seule. **À la fin de cette phase, le jeu doit
   être jouable de bout en bout.**
4. **Reconnexion** — Tout le contenu de la section 7, plus des tests qui simulent des coupures.
5. **Phase JUDGING** — Vote de la room sur les réponses en zone grise.
6. **Médias** — Images, puis audio, puis vidéo. Scripts de compression et préchargement.
7. **Back-office** — Admin des questions, import CSV.
8. **Polish** — Animations, écran hôte, podium, rejouer, sons d'ambiance optionnels.

---

## 12. Qualité et pièges à éviter

- TypeScript strict, pas de `any`.
- Tests Vitest sur : la normalisation des réponses, le calcul des scores, et la machine à états
  du DO. C'est là que les bugs feront mal.
- Rate limiting simple sur la création de rooms et l'envoi de messages.
- Sanitize les pseudos (longueur max 16, pas de HTML) et les réponses affichées.
- Prévois le cas dégénéré : 1 seul joueur, joueur qui ne répond jamais, tous déconnectés
  (nettoyage de la room via alarme après 30 min d'inactivité).
- Le projet s'inspire d'un **format** de party game, pas d'un produit existant : n'utilise aucun
  nom, logo, charte ou contenu appartenant à un jeu commercial. Propose-moi 5 noms originaux à
  la phase 1.

Commence par me présenter ton plan pour la phase 1 et les points où tu as besoin d'arbitrage.
