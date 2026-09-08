export const PHASES = [
  "LOBBY",
  "QUESTION",
  "CHAIN_PROMPT",
  "CHAIN_DRAW",
  "CHAIN_GUESS",
  "CHAIN_REVEAL",
  "BLUFF_WRITE",
  "BLUFF_VOTE",
  "BLUFF_REVEAL",
  "DUEL_PREDICT",
  "DUEL_ANSWER",
  "DUEL_REVEAL",
  "REFLEX_WAIT",
  "REFLEX_GO",
  "REFLEX_REVEAL",
  "BLUR_GUESS",
  "BLUR_REVEAL",
  "HOST_REVIEW",
  "FINISHED",
] as const;

export type Phase = (typeof PHASES)[number];

export const QUESTION_TYPES = ["text", "image", "audio", "video"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * Hard ceiling on one chain drawing, as data-URL characters (~45 KB of image).
 * Every drawing of a round is broadcast inside STATE_SYNC and kept in the room's Durable
 * Object storage, so this is a budget, not just an anti-abuse check: the client compresses
 * to land far below it (see DrawingCanvas), and anything above is refused outright.
 */
export const MAX_DRAWING_DATA_URL_LENGTH = 60_000;

/**
 * A drawing round needs three links to work — one writes, the next draws, a third guesses.
 * With two players the guesser is the author, who already knows the answer, so the slot is
 * skipped. Shared because the client explains the rule and the server enforces it.
 */
export const CHAIN_MIN_PLAYERS = 3;

/** A manual grade the host assigns to one player's answer during HOST_REVIEW. */
export const GRADES = [0, 0.5, 1] as const;
export type Grade = (typeof GRADES)[number];

export interface GameSettings {
  questionCount: number; // 5-40
  questionDurationSec: number; // 15-30
  /** Special rounds in the deck. Each counts towards questionCount. */
  chainRounds: number;
  bluffRounds: number;
  duelRounds: number;
  /** Reaction-time duels: the screen turns green, first tap wins. */
  reflexRounds: number;
  /** A picture that starts blurred and sharpens; answer early for more points. */
  blurRounds: number;
  /** Ordinary questions scored by proximity instead of by the host. */
  numericRounds: number;
  themes: string[]; // empty = all themes
}

export const MAX_CHAIN_ROUNDS = 6;
export const MAX_SPECIAL_ROUNDS = 6;

/** A bluff round needs enough fake answers to hide the real one among. */
export const BLUFF_MIN_PLAYERS = 3;
/** A duel needs two contestants and at least one spectator to make predictions worthwhile. */
export const DUEL_MIN_PLAYERS = 3;
/** A reflex round is a race, so two is already a game. */
export const REFLEX_MIN_PLAYERS = 2;
/** Guessing a blurred picture works alone, but the podium needs someone to beat. */
export const BLUR_MIN_PLAYERS = 2;

/** Points awarded by the self-scoring rounds. */
export const BLUFF_POINTS_FOUND = 2; // you spotted the real answer
export const BLUFF_POINTS_FOOLED = 1; // per player your fake caught
export const DUEL_POINTS_WINNER = 3;
export const DUEL_POINTS_PREDICTED = 1; // spectators who called it
export const NUMERIC_POINTS_CLOSEST = 2;
export const NUMERIC_POINTS_EXACT = 3;
export const REFLEX_POINTS_WINNER = 3;
export const REFLEX_POINTS_SECOND = 1;
/** Maths questions reward being right, and reward being right first a lot more. */
export const MATH_POINTS_CORRECT = 1;
export const MATH_POINTS_FASTEST = 3;

/**
 * A blurred picture pays by finishing order, not by a stopwatch.
 *
 * Ranked rather than proportional to the blur left, because a threshold everyone can see —
 * "I was third" — is worth more at a table than a score nobody can reconstruct.
 */
export const BLUR_POINTS_BY_RANK = [5, 3, 2] as const;
export const BLUR_POINTS_OTHER = 1;

/** How long the round runs, and how long the picture takes to come fully into focus. */
export const BLUR_GUESS_MS = 15_000;
export const BLUR_SHARPEN_MS = 10_000;
/** Blur radius at the very start, in CSS pixels on the rendered image. */
export const BLUR_MAX_PX = 34;

/** Theme ids the bank uses, with their display label. Shared so the settings screen and the
 *  question screen name a theme the same way. */
export const THEME_LABELS: Record<string, string> = {
  histoire: "Histoire",
  geo: "Géographie",
  sciences: "Sciences",
  cinema: "Cinéma",
  musique: "Musique",
  gaming: "Gaming",
  sport: "Sport",
  insolite: "Insolite",
  animaux: "Animaux",
  cuisine: "Cuisine",
  litterature: "Littérature",
  technologie: "Technologie",
  lol: "League of Legends",
  dofus: "Dofus",
  drapeaux: "Drapeaux",
  art: "Art",
  maths: "Maths",
  espace: "Espace",
  mythologie: "Mythologie",
  series: "Séries TV",
  anime: "Anime & Manga",
  heros: "Super-héros",
  blasons: "Blasons",
};

/**
 * Themes kept out of "tous les thèmes" unless someone asks for them by name.
 *
 * They are not lesser questions — they are questions about one game, and a table where half
 * the room has never played it stops being a quiz. Picking them explicitly is a deliberate
 * act; sweeping them in with everything else is not.
 */
export const OPT_IN_THEMES = ["lol", "dofus"] as const;

export const isOptInTheme = (theme: string): boolean => (OPT_IN_THEMES as readonly string[]).includes(theme);

export function themeLabel(id: string): string {
  return THEME_LABELS[id] ?? id;
}

export const DEFAULT_SETTINGS: GameSettings = {
  questionCount: 20,
  questionDurationSec: 20,
  chainRounds: 1,
  bluffRounds: 1,
  duelRounds: 1,
  reflexRounds: 1,
  blurRounds: 1,
  numericRounds: 2,
  themes: [],
};

export interface PlayerPublic {
  playerId: string;
  nickname: string;
  avatar: string; // emoji, or an svg-avatar id (see apps/web/src/components/Avatar.tsx)
  score: number;
  connected: boolean;
  isHost: boolean;
  hasAnswered: boolean; // only meaningful during QUESTION, never reveals content
}

/** Question shape sent to clients during QUESTION — never includes the answer. */
export interface QuestionPublic {
  id: number;
  theme: string;
  difficulty: 1 | 2 | 3;
  type: QuestionType;
  prompt: string;
  mediaUrl: string | null;
  /** "number": closest answer wins. "math": exact answer, fastest correct one wins.
   *  "blur": a picture that sharpens, answered by finishing order. None of the three reach
   *  the host review — there is nothing to judge in arithmetic or in a name that matches. */
  answerKind: "text" | "number" | "list" | "math" | "blur";
}

/**
 * What the current player must do right now during a chain ("téléphone dessiné") round.
 * `content` is what was handed to them by the previous link in the chain — null for the
 * "prompt" role, which originates the chain instead of continuing it.
 */
export interface ChainTask {
  role: "prompt" | "draw" | "guess";
  content: string | null;
  alreadySubmitted: boolean;
}

/** One fully-resolved chain, shown to everyone during CHAIN_REVEAL. */
export interface ChainResult {
  originPlayerId: string;
  originNickname: string;
  prompt: string;
  drawerNickname: string;
  drawingDataUrl: string;
  guesserNickname: string;
  guess: string;
  /** The host's ruling. Pre-filled from the text matcher, but the host has the last word. */
  matched: boolean;
  points: number;
}

/** One player's answer to one trivia question, as graded (or not yet) by the host. */
export interface ReviewAnswer {
  playerId: string;
  nickname: string;
  raw: string;
  grade: Grade | null;
}

/** One trivia question and every answer given to it, for the host's end-of-game review pass. */
export interface ReviewQuestion {
  deckIndex: number;
  prompt: string;
  correctAnswer: string;
  explanation: string | null;
  answers: ReviewAnswer[];
}

/**
 * The full state a client needs to render itself from scratch — sent as STATE_SYNC.
 * No client-side guessing allowed: everything visible must be derivable from this alone.
 */
/** What a player sees during a bluff round. */
export interface BluffView {
  step: "write" | "vote" | "reveal";
  prompt: string;
  /** During "write": whether you have already offered a lie. */
  submitted: boolean;
  /** During "vote" and "reveal": the shuffled options. Authors are withheld until reveal. */
  options: { id: string; text: string; authorNickname: string | null; isReal: boolean }[];
  /** The option you voted for, if any. */
  yourVote: string | null;
  /** During "reveal": who voted for what, and what it earned them. */
  results: { nickname: string; votedText: string; correct: boolean }[] | null;
}

/** One thing a duellist typed, and whether it landed. */
export interface DuelAttempt {
  text: string;
  hit: boolean;
}

/** What a player sees during a duel round. */
export interface DuelView {
  step: "predict" | "answer" | "reveal";
  prompt: string;
  /**
   * The two fighters, with what they have typed so far.
   *
   * `attempts` is deliberately everything they submitted, valid or not, in order: spectators
   * were only shown a score climbing, which is not a duel to watch. Seeing the misses is most
   * of the fun, and there is nothing to protect — the answers are the other player's, not the
   * question's, and only these two can submit anyway.
   */
  contestants: { playerId: string; nickname: string; found: number; attempts: DuelAttempt[] }[];
  /** True when you are one of the two fighting. */
  youAreContestant: boolean;
  /** The contestant you backed, if you are a spectator who has called it. */
  yourPrediction: string | null;
  /** Your own accepted items, so a contestant can see what has landed. */
  yourFound: string[];
  /** During "reveal": each contestant's accepted items, and the winner. */
  reveal: { nickname: string; found: string[]; winner: boolean }[] | null;
  /** How many answers the question accepts in total, shown as a target. */
  acceptedTotal: number;
}

/**
 * What a player sees during a reflex round.
 *
 * There is deliberately no "when does it turn green" field. The moment lives only in the
 * Durable Object's alarm, and `phaseDeadlineTs` stays null while waiting — send the client a
 * countdown and anyone with the network tab open wins every round.
 *
 * The times measured include the network round trip (~40 ms on a domestic connection), so
 * they are not laboratory reaction times. Human reaction sits around 250 ms, which is where
 * the differences that decide a round actually come from.
 */
export interface ReflexView {
  step: "wait" | "go" | "reveal";
  /** You have a result for this round, right or wrong. */
  youTapped: boolean;
  /** You tapped before it turned green, so you are out of this round. */
  falseStart: boolean;
  yourMs: number | null;
  /** During "reveal": everyone's time, fastest first. */
  results: { nickname: string; ms: number | null; falseStart: boolean; points: number }[] | null;
}

/**
 * What a player sees during a blurred-picture round.
 *
 * The blur itself is not sent: it is a pure function of how much of the round is left, which
 * the client already has through `phaseDeadlineTs` and the shared `BLUR_SHARPEN_MS`. Sending
 * a radius per frame would be sixty state syncs a second for something arithmetic.
 */
export interface BlurView {
  step: "guess" | "reveal";
  /** The question itself. Carried here rather than hardcoded on the screen: the round runs
   *  on champion portraits and on flags, and "Qui est-ce ?" is wrong for a flag. */
  prompt: string;
  imageUrl: string;
  /** Your own submission, locked in once sent. */
  yourAnswer: string | null;
  /** Set at the reveal only. */
  correctAnswer: string | null;
  results: { nickname: string; answer: string; correct: boolean; points: number }[] | null;
  /** How many players have locked in, so the room can see the pressure build. */
  answered: number;
  total: number;
}

export interface RoomStateSync {
  roomCode: string;
  phase: Phase;
  settings: GameSettings;
  players: PlayerPublic[];
  hostPlayerId: string;
  questionIndex: number; // 0-based index into the full deck (trivia + chain slots)
  questionTotal: number;
  currentQuestion: QuestionPublic | null;
  /** Set during QUESTION so the client can preload the next question's media in advance. */
  nextQuestionMedia: { type: QuestionType; url: string } | null;
  phaseDeadlineTs: number | null; // absolute server timestamp, null = no countdown
  /**
   * The server's clock at the moment this state was built.
   *
   * `phaseDeadlineTs` is a server timestamp, and comparing it to the browser's `Date.now()`
   * is only correct if the two clocks agree. They do not: a two-second skew showed a 15-second
   * question counting down from 17, and made the "send what is typed just before time runs
   * out" safety net fire *after* the round had already closed. Clients subtract the offset
   * instead of trusting their own clock.
   */
  serverNowTs: number;
  youHaveAnswered: boolean;
  chainTask: ChainTask | null;
  chainReveal: ChainResult[] | null;
  bluff: BluffView | null;
  duel: DuelView | null;
  reflex: ReflexView | null;
  blur: BlurView | null;
  /** Every trivia question and answer of the game, sent to the whole room during HOST_REVIEW
   *  so everyone watches the host grade. Only the host's grades are accepted. */
  reviewQuestions: ReviewQuestion[] | null;
  /** Which review card the room is on. Driven by the host, followed by everyone. */
  reviewIndex: number;
}
