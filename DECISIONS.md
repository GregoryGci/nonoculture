# Décisions prises en autonomie (à valider au réveil)

Le brief demandait de proposer 5 noms et 2-3 couleurs d'accent avant de trancher.
Comme le travail a été fait de nuit sans validation possible, j'ai tranché moi-même
pour ne pas bloquer le projet. Tout est facilement changeable — voir "Comment changer" en bas.

## Nom du projet : **Quiproquo**

Candidats proposés :
1. **Quiproquo** ✅ (retenu) — mot français existant qui désigne un malentendu comique :
   colle parfaitement au concept central (tout le monde voit les réponses de tout le
   monde, y compris les plus à côté de la plaque). Court, mémorable, pas de trademark
   connu dans le jeu vidéo/party game.
2. Bourde Party — sympa mais "bourde" tout seul est un peu négatif comme nom de marque.
3. Cervolte — contraction cerveau/révolte, punchy mais moins clair au premier coup d'œil.
4. Culture Chaos — correct mais générique, sonne comme 50 autres quiz apps.
5. Savant Faux — jeu de mots (savant fou / faux), trop subtil à l'oral.

Slug technique utilisé partout dans le code : `quiproquo`.

## Couleur d'accent : **Ambre chaud `#F0A93F`**

Options considérées :
1. **Ambre `#F0A93F`** ✅ (retenu) — évoque le buzzer/le projecteur de jeu télévisé,
   chaud sans être criard, excellent contraste sur fond `#0B0D12` (ratio ~9:1), se
   distingue bien du texte secondaire gris-bleu.
2. Corail `#FF6B4A` — très bien aussi, un poil plus "app ludique/enfantine".
3. Violet électrique `#7C5CFC` — look plus "tech/SaaS", moins "soirée entre potes".

## Comment changer ces choix

- Nom : chercher/remplacer `Quiproquo` / `quiproquo` dans le repo (peu d'occurrences,
  concentrées dans `apps/web/index.html`, `apps/web/src/app.tsx`, `package.json` racine,
  `CLAUDE.md`).
- Couleur : une seule variable CSS `--accent` dans `apps/web/src/styles/theme.css`.

## Autres arbitrages pris de nuit

- Phases 1 à 6 de la section 11 du brief enchaînées sans pause de validation
  intermédiaire, avec auto-vérification par les tests Vitest à chaque étape plutôt
  que par ton retour humain. Phases 7 (back-office) et 8 (polish) laissées pour la
  suite — voir `docs/PROGRESS.md` pour l'état exact à ton réveil.
- Cloudflare : aucune ressource réelle créée (pas de compte connecté). Tout tourne en
  local via l'émulation Wrangler (`--local` / Miniflare) : D1, R2 et les Durable
  Objects sont simulés sur disque. Au réveil : `wrangler login`, puis `pnpm cf:setup`
  (script à créer en phase Setup) pour créer les vraies ressources et déployer.
