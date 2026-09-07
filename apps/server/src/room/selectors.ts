import { isChainMatch, normalizeAnswer } from "@nonoculture/shared";
import type {
  BluffView,
  ChainResult,
  ChainTask,
  DuelView,
  PlayerPublic,
  QuestionPublic,
  ReflexView,
  ReviewQuestion,
  RoomStateSync,
} from "@nonoculture/shared";
import { originForRole } from "./state-machine.js";
import { CHAIN_POINTS } from "./types.js";
import type { GameState, InternalQuestion } from "./types.js";

function triviaAt(state: GameState, index: number): InternalQuestion | null {
  const item = state.deck[index];
  return item?.kind === "trivia" ? item.question : null;
}

/** The question behind whichever slot is in play, or null for the slots that carry none. */
function questionAt(state: GameState, index: number): InternalQuestion | null {
  const item = state.deck[index];
  if (!item || item.kind === "chain" || item.kind === "reflex") return null;
  return item.question;
}

/**
 * The bluff round as one player sees it.
 *
 * Authorship is withheld until the reveal — sending it during the vote would put the answer
 * in the network inspector, which is the whole game.
 */
function computeBluff(state: GameState, forPlayerId: string, nicknameOf: (id: string) => string): BluffView | null {
  const bluff = state.bluff;
  const question = questionAt(state, state.deckIndex);
  if (!bluff || !question) return null;
  const step =
    state.phase === "BLUFF_WRITE"
      ? "write"
      : state.phase === "BLUFF_VOTE"
        ? "vote"
        : state.phase === "BLUFF_REVEAL"
          ? "reveal"
          : null;
  if (!step) return null;

  const revealing = step === "reveal";
  const options = (step === "write" ? [] : bluff.options).map((o) => ({
    id: o.id,
    text: o.text,
    authorNickname: revealing && o.authorId ? nicknameOf(o.authorId) : null,
    isReal: revealing ? o.authorId === null : false,
  }));

  const byOption = new Map(bluff.options.map((o) => [o.id, o]));
  const results = revealing
    ? Object.entries(bluff.votes).map(([voterId, optionId]) => ({
        nickname: nicknameOf(voterId),
        votedText: byOption.get(optionId)?.text ?? "—",
        correct: byOption.get(optionId)?.authorId === null,
      }))
    : null;

  return {
    step,
    prompt: question.prompt,
    submitted: bluff.fakes[forPlayerId] !== undefined,
    options,
    yourVote: bluff.votes[forPlayerId] ?? null,
    results,
  };
}

/**
 * The reflex round as one player sees it.
 *
 * Note what is absent: `goAtTs`. The whole round rests on nobody being able to see the green
 * light coming, so the schedule stays in the Durable Object and only the fact that it has
 * *already* happened is ever sent.
 */
function computeReflex(state: GameState, forPlayerId: string, nicknameOf: (id: string) => string): ReflexView | null {
  const reflex = state.reflex;
  if (!reflex) return null;
  const step =
    state.phase === "REFLEX_WAIT"
      ? "wait"
      : state.phase === "REFLEX_GO"
        ? "go"
        : state.phase === "REFLEX_REVEAL"
          ? "reveal"
          : null;
  if (!step) return null;

  const falseStart = reflex.falseStarts.includes(forPlayerId);
  const yourMs = reflex.times[forPlayerId] ?? null;

  return {
    step,
    youTapped: yourMs !== null || falseStart,
    falseStart,
    yourMs,
    results:
      step === "reveal"
        ? Object.values(state.players)
            .map((p) => ({
              nickname: nicknameOf(p.playerId),
              ms: reflex.times[p.playerId] ?? null,
              falseStart: reflex.falseStarts.includes(p.playerId),
              points: reflex.points[p.playerId] ?? 0,
            }))
            // Fastest first; anyone who never registered a time trails behind.
            .sort((a, b) => (a.ms ?? Number.MAX_SAFE_INTEGER) - (b.ms ?? Number.MAX_SAFE_INTEGER))
        : null,
  };
}

/** The duel as one player sees it — including, for everyone, what both fighters are typing. */
function computeDuel(state: GameState, forPlayerId: string, nicknameOf: (id: string) => string): DuelView | null {
  const duel = state.duel;
  const question = questionAt(state, state.deckIndex);
  if (!duel || !question) return null;
  const step =
    state.phase === "DUEL_PREDICT"
      ? "predict"
      : state.phase === "DUEL_ANSWER"
        ? "answer"
        : state.phase === "DUEL_REVEAL"
          ? "reveal"
          : null;
  if (!step) return null;

  const accepted = [question.answer, ...question.aliases].filter((a) => normalizeAnswer(a).length > 0);
  const youAreContestant = duel.contestants.includes(forPlayerId);
  const counts = duel.contestants.map((id) => {
    const found = new Set(duel.found[id] ?? []);
    // Everything typed, in order, so spectators watch the duel happen instead of watching a
    // counter — misses included, since those are the part worth shouting at.
    //
    // Except to the opponent. A duellist who could read the other's list in the network tab
    // would simply retype it, which is the same leak as broadcasting answers during a
    // question. Contestants see their own list and their rival's score, nothing more.
    const visible = !youAreContestant || id === forPlayerId;
    return {
      playerId: id,
      nickname: nicknameOf(id),
      found: found.size,
      attempts: visible ? (duel.attempts[id] ?? []).map((text) => ({ text, hit: found.has(text) })) : [],
    };
  });

  const [a, b] = duel.contestants;
  const winner =
    (duel.found[a]?.length ?? 0) === (duel.found[b]?.length ?? 0)
      ? null
      : (duel.found[a]?.length ?? 0) > (duel.found[b]?.length ?? 0)
        ? a
        : b;

  return {
    step,
    prompt: question.prompt,
    contestants: counts,
    youAreContestant: duel.contestants.includes(forPlayerId),
    yourPrediction: duel.predictions[forPlayerId] ?? null,
    yourFound: duel.found[forPlayerId] ?? [],
    reveal:
      step === "reveal"
        ? duel.contestants.map((id) => ({
            nickname: nicknameOf(id),
            found: duel.found[id] ?? [],
            winner: id === winner,
          }))
        : null,
    acceptedTotal: accepted.length,
  };
}

/** Looks up a chain drawing's data URL — the bytes live outside GameState (see ChainRoundState). */
export type DrawingResolver = (originPlayerId: string) => string;

function computeChainTask(state: GameState, forPlayerId: string, resolveDrawing: DrawingResolver): ChainTask | null {
  if (!state.chain || !state.chain.order.includes(forPlayerId)) return null;
  const { order, prompts, drawings, guesses } = state.chain;

  if (state.phase === "CHAIN_PROMPT") {
    return { role: "prompt", content: null, alreadySubmitted: prompts[forPlayerId] !== undefined };
  }
  if (state.phase === "CHAIN_DRAW") {
    const origin = originForRole(order, forPlayerId, 1);
    return {
      role: "draw",
      content: origin ? (prompts[origin] ?? "") : null,
      alreadySubmitted: origin ? drawings[origin] === true : false,
    };
  }
  if (state.phase === "CHAIN_GUESS") {
    const origin = originForRole(order, forPlayerId, 2);
    return {
      role: "guess",
      content: origin ? resolveDrawing(origin) : null,
      alreadySubmitted: origin ? guesses[origin] !== undefined : false,
    };
  }
  return null;
}

function computeChainReveal(
  state: GameState,
  nicknameOf: (id: string) => string,
  resolveDrawing: DrawingResolver,
): ChainResult[] | null {
  if (state.phase !== "CHAIN_REVEAL" || !state.chain) return null;
  const { order, prompts, guesses, validated } = state.chain;
  return order.map((originId, idx) => {
    const drawerId = order[(idx + 1) % order.length]!;
    const guesserId = order[(idx + 2) % order.length]!;
    const prompt = prompts[originId] ?? "";
    const guess = guesses[originId] ?? "";
    // The host's ruling, falling back to the matcher's for a round that never reached the
    // reveal. Showing the matcher's verdict next to the host's would be showing two truths.
    const matched = validated[originId] ?? isChainMatch(guess, prompt);
    return {
      originPlayerId: originId,
      originNickname: nicknameOf(originId),
      prompt,
      drawerNickname: nicknameOf(drawerId),
      drawingDataUrl: resolveDrawing(originId),
      guesserNickname: nicknameOf(guesserId),
      guess,
      matched,
      points: matched ? CHAIN_POINTS : 0,
    };
  });
}

/**
 * The grading list, for the host alone.
 *
 * Everyone used to receive it so the room could follow along, but players now wait on the
 * podium instead, and shipping every answer to a client that never displays them only puts
 * them in reach of the network inspector.
 */
/**
 * The end-of-game correction, sent to everyone.
 *
 * It was host-only for a while, with the other players parked on a provisional podium. That
 * turned out to mean the host had to screen-share to let anyone follow, so the list goes to
 * the whole room again — read-only, since `SUBMIT_HOST_GRADE` is refused for anyone but the
 * host, and every grade re-broadcasts the state. Nothing secret is exposed: by this point the
 * game is over and the answers were going to be read out loud anyway.
 */
function computeReviewQuestions(
  state: GameState,
  forPlayerId: string,
  nicknameOf: (id: string) => string,
): ReviewQuestion[] | null {
  if (state.phase !== "HOST_REVIEW") return null;
  void forPlayerId;
  return Object.entries(state.answerLog)
    .map(([deckIndexStr, answers]) => {
      const deckIndex = Number(deckIndexStr);
      const question = triviaAt(state, deckIndex);
      return {
        deckIndex,
        prompt: question?.prompt ?? "",
        correctAnswer: question?.answer ?? "",
        explanation: question?.explanation ?? null,
        answers: answers.map((a) => ({
          playerId: a.playerId,
          nickname: nicknameOf(a.playerId),
          raw: a.raw,
          grade: state.grades[`${deckIndex}:${a.playerId}`] ?? null,
        })),
      };
    })
    .sort((a, b) => a.deckIndex - b.deckIndex);
}

export function buildStateSync(
  state: GameState,
  forPlayerId: string,
  resolveMediaUrl: (mediaKey: string) => string = () => "",
  resolveDrawing: DrawingResolver = () => "",
): RoomStateSync {
  const players: PlayerPublic[] = Object.values(state.players)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
      isHost: p.isHost,
      hasAnswered: state.answers.some((a) => a.playerId === p.playerId),
    }));

  const question = triviaAt(state, state.deckIndex);
  const currentQuestion: QuestionPublic | null = question
    ? {
        id: question.id,
        theme: question.theme,
        difficulty: question.difficulty,
        type: question.type,
        prompt: question.prompt,
        mediaUrl: question.mediaKey ? resolveMediaUrl(question.mediaKey) : null,
        answerKind: question.answerKind,
      }
    : null;

  // Preloaded while the current question is on screen, so it's already cached by the time we advance.
  const nextQuestion = triviaAt(state, state.deckIndex + 1);
  const nextQuestionMedia =
    state.phase === "QUESTION" && nextQuestion?.mediaKey
      ? { type: nextQuestion.type, url: resolveMediaUrl(nextQuestion.mediaKey) }
      : null;

  const nicknameOf = (playerId: string) => state.players[playerId]?.nickname ?? "?";

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    settings: state.settings,
    players,
    hostPlayerId: state.hostPlayerId,
    questionIndex: state.deckIndex,
    questionTotal: state.deck.length,
    currentQuestion,
    nextQuestionMedia,
    phaseDeadlineTs: state.phaseDeadlineTs,
    youHaveAnswered: state.answers.some((a) => a.playerId === forPlayerId),
    chainTask: computeChainTask(state, forPlayerId, resolveDrawing),
    chainReveal: computeChainReveal(state, nicknameOf, resolveDrawing),
    bluff: computeBluff(state, forPlayerId, nicknameOf),
    duel: computeDuel(state, forPlayerId, nicknameOf),
    reflex: computeReflex(state, forPlayerId, nicknameOf),
    reviewQuestions: computeReviewQuestions(state, forPlayerId, nicknameOf),
    reviewIndex: state.reviewIndex,
    serverNowTs: Date.now(),
  };
}
