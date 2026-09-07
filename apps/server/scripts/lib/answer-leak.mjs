/**
 * Rejects generated questions that hand over their own answer.
 *
 * Wikidata templates produce these constantly and they are invisible until you play:
 * "Dans quelle ville joue le club Spartak Moscou ?" (Moscou), "À quel sport se rattache
 * l'épreuve « championnat de Serbie de football » ?" (football), "Dans quel pays paie-t-on
 * en dollar canadien ?" (Canada). 16% of the first generated bank was in this state.
 *
 * Two refinements, both learned from what a naive version got wrong:
 *
 *  - The prefix comparison catches the adjectival forms — canadien/Canada, guyanien/Guyana —
 *    that a plain substring test walks straight past.
 *  - A question names the *category* it asks about, and a French answer usually repeats it:
 *    "Quelle guerre a opposé le Nord et le Sud ?" → "la guerre de Sécession". Nothing is
 *    given away there; the distinctive word is. So category nouns are ignored, and only the
 *    rest of the answer counts.
 *
 * It still over-rejects a little: "Qui a réalisé « Andreï Roublev » ?" (Andreï Tarkovski)
 * is a fine question that happens to share a first name. That is the right direction to err
 * in — one lost question out of thousands costs nothing, one question that answers itself is
 * noticed by everyone in the room.
 */

/** Grammatical filler. Too short or too common to mean anything on its own. */
const STOPWORDS = new Set([
  "dans",
  "pour",
  "avec",
  "sans",
  "chez",
  "cette",
  "leur",
  "plus",
  "tout",
  "tous",
  "aux",
  "des",
  "les",
  "une",
  "est",
  "son",
  "sur",
  "par",
  "que",
  "qui",
  "the",
  "and",
]);

/**
 * Words that name what the question is asking for rather than identifying the answer.
 *
 * When one of these is shared between question and answer it is grammar, not a giveaway:
 * "Quel nuage sphérique… ?" answered by "le nuage de Oort" hides everything that mattered.
 * The alternative — only flagging when *every* word of the answer is in the prompt — was
 * tried and is worse: it lets "Quel pays a pour capitale São Tomé ?" / "Sao Tomé-et-Principe"
 * straight through. So the list is the mechanism, and it grows as new domains are added.
 */
const CATEGORY_NOUNS = new Set([
  // added with the space, series and mythology banks
  "station",
  "nuage",
  "ceinture",
  "nebuleuse",
  "matiere",
  "tache",
  "mission",
  "satellite",
  "satellites",
  "telescope",
  "sonde",
  "navette",
  "galaxie",
  "comete",
  "cratere",
  "constellation",
  "energie",
  "horizon",
  "rayonnement",
  "unite",
  "distance",
  "theorie",
  "reaction",
  "phenomene",
  "agence",
  "programme",
  "createur",
  "acteur",
  "actrice",
  "actrices",
  "acteurs",
  "personnage",
  "personnages",
  "heros",
  "heroine",
  "dieu",
  "deesse",
  "dieux",
  "titan",
  "creature",
  "creatures",
  "monstre",
  "geant",
  "geante",
  "royaume",
  "cite",
  "ile",
  "metier",
  "classe",
  "caracteristique",
  "sort",
  "objet",
  "arme",
  "monture",
  "familier",
  "familiers",
  "donjon",
  "quete",
  "mode",
  "carte",
  "manche",
  "saison",
  "episode",
  "chaine",
  "studio",
  "auteur",
  "mangaka",
  "pouvoir",
  "pouvoirs",
  "equipe",
  "organisation",
  "guerre",
  "guerres",
  "traite",
  "traites",
  "bataille",
  "empire",
  "royaume",
  "dynastie",
  "ocean",
  "mer",
  "fleuve",
  "riviere",
  "detroit",
  "canal",
  "golfe",
  "desert",
  "montagne",
  "sommet",
  "chaine",
  "volcan",
  "lac",
  "ville",
  "capitale",
  "pays",
  "region",
  "continent",
  "film",
  "films",
  "serie",
  "series",
  "saga",
  "jeu",
  "jeux",
  "album",
  "chanson",
  "groupe",
  "livre",
  "roman",
  "piece",
  "tableau",
  "sport",
  "sports",
  "epreuve",
  "club",
  "equipe",
  "coupe",
  "championnat",
  "tournoi",
  "monnaie",
  "devise",
  "langue",
  "planete",
  "etoile",
  "element",
  "particule",
  "vitamine",
  "couche",
  "molecule",
  "atome",
  "animal",
  "oiseau",
  "poisson",
  "insecte",
  "arbre",
  "fleur",
  "instrument",
  "console",
  "entreprise",
  "marque",
  "evenement",
  "conflit",
  "periode",
  "siecle",
  "annee",
  "annees",
  "jour",
  "jours",
  "heure",
  "heures",
  "minute",
  "point",
  "points",
  "metre",
  "metres",
  "kilometre",
  "kilometres",
]);

/** Minimum shared prefix for two words to count as the same root. Four collides too often
 *  ("mont", "port", "saint"); six misses "canad|ien". */
const ROOT_LENGTH = 5;

const normalize = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const words = (s) =>
  normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

/** The part of an answer that actually identifies it: everything but the category noun. */
const identifyingWords = (answer) => words(answer).filter((w) => !CATEGORY_NOUNS.has(w));

export function answerLeaksIntoPrompt(prompt, answer) {
  const p = normalize(prompt);
  const a = normalize(answer);
  if (a.length < 3) return false;

  // The whole answer, verbatim, in the question. No argument to have.
  if (a.length >= 4 && p.includes(a)) return true;

  // A numeric answer is never given away by its unit: "combien de jours ?" → "88 jours".
  const identifying = identifyingWords(answer).filter((w) => !/^\d+$/.test(w));
  if (identifying.length === 0) return false;

  // Word against word, never against the raw prompt: a plain substring search finds "lane"
  // inside "planet" and rejects "Quelle journaliste du Daily Planet… ?" / "Lois Lane".
  const promptWords = words(prompt);
  return identifying.some((word) =>
    promptWords.some((other) => word === other || word.slice(0, ROOT_LENGTH) === other.slice(0, ROOT_LENGTH)),
  );
}
