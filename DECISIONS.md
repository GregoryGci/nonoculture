# Décisions prises en autonomie

Ce fichier garde la trace des choix tranchés sans validation préalable, et de ceux que tu as
tranchés depuis. Tout reste changeable — voir "Comment changer" en bas.

## Nom du projet : **Nono Culture**

Le projet s'est d'abord appelé **Quiproquo**, nom choisi en autonomie la première nuit
(mot français pour un malentendu comique, qui collait au concept : tout le monde voit les
réponses de tout le monde). Renommé **Nono Culture** sur ta demande — c'est le nom définitif.
Les autres candidats proposés à l'époque : Bourde Party, Cervolte, Culture Chaos, Savant Faux.

Slug technique utilisé partout dans le code : `nonoculture`. Le nom de la base D1 est resté
`quiproquo-db` : la renommer voudrait dire recréer la base et re-seeder 4 900 questions, pour
un identifiant que personne ne voit.

## Direction artistique : **premium sobre** (Apple / SpaceX / Starlink)

Deux DA ont précédé celle-ci : ambre chaud sur fond neutre (nuit 1, en autonomie), puis
cyberpunk néon cyan/magenta (sur demande). Remplacées par la direction actuelle, demandée
explicitement :

- Fond **noir pur** `#000000`, surfaces en blanc translucide (`rgba(255,255,255,0.04)` et
  `0.07`) plutôt qu'en gris opaque — la profondeur vient de la transparence, pas des bordures.
- Accent : **blanc** `#ffffff` sur texte noir pour l'action principale. Un seul accent rouge
  `#ff453a` pour les erreurs. Pas de couleur décorative : la hiérarchie se fait au contraste
  et à l'espacement.
- Typo : **Inter** partout, y compris pour les chiffres (en `font-variant-numeric: tabular-nums`
  pour que scores et timers ne sautent pas).
- Rayons : 18px pour les cartes, 12px pour les contrôles.
- Animations : librairie **motion**, courbe expo-out `cubic-bezier(0.16, 1, 0.3, 1)` partout —
  entrée rapide, sortie longue. Respecte `prefers-reduced-motion`.
- Avatars : 12 robots, style **bottts** de DiceBear par Pablo Stanley (libre pour usage
  personnel et commercial, aucune attribution requise). Générés **hors ligne** par
  `apps/server/scripts/generate-avatars.mjs` (paquets npm `@dicebear/core` +
  `@dicebear/collection`, en devDependencies) vers `apps/web/public/avatars/*.svg`, qui
  sont commitées. L'app sert donc des fichiers finis : plus d'appel à l'API publique
  DiceBear au rendu, plus de dépendance à un tiers. Relancer le script uniquement pour
  changer le jeu d'avatars.

## Comment changer ces choix

- Nom : chercher/remplacer `Nono Culture` / `nonoculture` dans le repo (peu d'occurrences,
  concentrées dans `apps/web/index.html`, `apps/web/src/app.tsx`, `package.json` racine,
  `CLAUDE.md`).
- Couleur/thème : tokens `--color-*` et `--font-*` dans `apps/web/src/styles/theme.css`.
- Avatars : tableau `AVATARS` dans `apps/web/src/components/Avatar.tsx`.

## Autres arbitrages

- Phases 1 à 6 de la section 11 du brief enchaînées sans pause de validation
  intermédiaire, avec auto-vérification par les tests Vitest à chaque étape plutôt
  que par un retour humain. Phase 7 (back-office `/admin`) toujours pas commencée.
- **Cloudflare : compte connecté, Worker déployé.** D1 `quiproquo-db` en production,
  migrations appliquées, banque complète chargée.
- **R2 écarté volontairement** : son activation demande une carte bancaire, ce que tu as
  refusé. Les médias sont donc des fichiers statiques servis par le binding `ASSETS` du
  Worker, à côté du front buildé. Le bloc `[[r2_buckets]]` reste commenté dans
  `wrangler.toml` et le code teste `mediaAvailable` avant de tirer une question média.
- **Scoring : manuel par défaut, automatique là où c'est de l'arithmétique.** L'hôte note
  les réponses libres en fin de partie ; les questions numériques (le plus proche gagne),
  les duels (comptage de touches) et les manches dessinées se scorent seuls.
- **Sources de questions : CC0 uniquement.** Wikidata pour le texte, Freesound pour l'audio,
  Commons pour les images — avec vérification de licence **fichier par fichier**, parce que
  la licence d'un site ne dit rien de celle d'un fichier précis.
