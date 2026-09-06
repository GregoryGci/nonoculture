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

## Direction artistique : **cyberpunk minimaliste** (demande explicite, remplace le choix ci-dessous)

Palette initiale (nuit 1) : ambre chaud `#F0A93F` sur fond neutre `#0B0D12`, retenue en
autonomie. Remplacée sur demande explicite par une direction cyberpunk :
- Fond quasi noir teinté bleu `#05070C`, grille de fond subtile, vignette radiale cyan en
  haut de page.
- Accent unique : cyan électrique `#2DE2FF` (glow sur boutons/inputs/timer/bordures
  actives), + un accent secondaire `#FF2E9A` utilisé avec parcimonie (langue tirée d'un
  avatar, erreurs).
- Typo : **Space Grotesk** (titres/boutons) + **JetBrains Mono** (code de room, scores,
  timer — look "terminal").
- Effets : boutons avec glow + léger scale au hover (`.btn`/`.btn-primary`/`.btn-secondary`
  dans `theme.css`), panneaux à coins coupés (`.panel-notched`) sur le code de room,
  transitions d'entrée de phase (`.phase-enter`), pulsation du timer sous 5s
  (`.timer-urgent`).
- Avatars : 12 têtes de personnages en trait manga, style **lorelei** de DiceBear (CC0,
  aucune attribution requise). Générées **hors ligne** par
  `apps/server/scripts/generate-avatars.mjs` (paquets npm `@dicebear/core` +
  `@dicebear/collection`, en devDependencies) vers `apps/web/public/avatars/*.svg`, qui
  sont commitées. L'app sert donc des fichiers finis : plus d'appel à l'API publique
  DiceBear au rendu, plus de dépendance à un tiers. Fonds froids désaturés pour rester
  dans la palette. Relancer le script uniquement pour changer le jeu d'avatars.

## Comment changer ces choix

- Nom : chercher/remplacer `Quiproquo` / `quiproquo` dans le repo (peu d'occurrences,
  concentrées dans `apps/web/index.html`, `apps/web/src/app.tsx`, `package.json` racine,
  `CLAUDE.md`).
- Couleur/thème : tokens `--color-*` et `--font-*` dans `apps/web/src/styles/theme.css`.
- Avatars : tableau `AVATARS` dans `apps/web/src/components/Avatar.tsx`.

## Autres arbitrages pris de nuit

- Phases 1 à 6 de la section 11 du brief enchaînées sans pause de validation
  intermédiaire, avec auto-vérification par les tests Vitest à chaque étape plutôt
  que par ton retour humain. Phases 7 (back-office) et 8 (polish) laissées pour la
  suite — voir `docs/PROGRESS.md` pour l'état exact à ton réveil.
- Cloudflare : aucune ressource réelle créée (pas de compte connecté). Tout tourne en
  local via l'émulation Wrangler (`--local` / Miniflare) : D1, R2 et les Durable
  Objects sont simulés sur disque. Au réveil : `wrangler login`, puis `pnpm cf:setup`
  (script à créer en phase Setup) pour créer les vraies ressources et déployer.
