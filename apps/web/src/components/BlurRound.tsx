import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { BLUR_GUESS_MS, BLUR_MAX_PX, BLUR_POINTS_BY_RANK, BLUR_SHARPEN_MS } from "@nonoculture/shared";
import type { BlurView } from "@nonoculture/shared";
import { useDeadlineFlush } from "../hooks/useDeadlineFlush";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The blurred picture: it comes into focus over ten seconds, and answering early pays more.
 *
 * The radius is computed here rather than received. It is a pure function of how much of the
 * round is left, and the client already knows that from the deadline — sending it would be a
 * state sync per animation frame for something both sides can derive. What the client does
 * *not* decide is the score: the server timestamps the answer on arrival and ranks from that,
 * so a paused tab or a lying clock changes nothing but what this player sees.
 */
export function BlurRound({
  blur,
  deadlineTs,
  clockOffset,
  onAnswer,
}: {
  blur: BlurView;
  deadlineTs: number | null;
  clockOffset: number;
  onAnswer: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const locked = blur.yourAnswer !== null || blur.step === "reveal";

  // Whatever is half-typed when time runs out still counts as a guess.
  useDeadlineFlush({ deadlineTs, clockOffset, value, locked, onFlush: onAnswer });

  const submit = () => {
    const text = value.trim();
    if (locked || text.length === 0) return;
    onAnswer(text);
  };

  return (
    <div className="flex flex-col gap-5">
      <BlurredImage
        src={blur.imageUrl}
        deadlineTs={deadlineTs}
        clockOffset={clockOffset}
        sharp={blur.step === "reveal"}
      />

      {blur.step === "guess" ? (
        <>
          {locked ? (
            <div className="panel flex items-center justify-between gap-4 px-5 py-4">
              <span className="text-[17px] font-medium">{blur.yourAnswer}</span>
              <span className="text-[13px]" style={{ color: "var(--color-text-faint)" }}>
                réponse envoyée
              </span>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex gap-3"
            >
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={60}
                placeholder="Ton idée…"
                aria-label="Ta réponse"
                className="input-cyber h-14 flex-1 rounded-[var(--radius-control)] px-5"
              />
              <button type="submit" disabled={value.trim().length === 0} className="btn btn-primary h-14 px-6">
                Valider
              </button>
            </form>
          )}

          <p className="text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            {locked
              ? `${blur.answered} / ${blur.total} ont répondu`
              : `Plus tu réponds tôt, plus tu marques — ${BLUR_POINTS_BY_RANK.join(", ")} points aux premiers.`}
          </p>
        </>
      ) : (
        <BlurResults blur={blur} />
      )}
    </div>
  );
}

/** The picture itself, sharpening in real time. */
function BlurredImage({
  src,
  deadlineTs,
  clockOffset,
  sharp,
}: {
  src: string;
  deadlineTs: number | null;
  clockOffset: number;
  sharp: boolean;
}) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (sharp || deadlineTs === null) {
      node.style.filter = "blur(0px)";
      return;
    }
    // Driven straight onto the node instead of through state: this runs every frame, and a
    // re-render per frame would take the whole answer form with it — including the input the
    // player is typing into.
    let raf = 0;
    const tick = () => {
      const remaining = deadlineTs - (Date.now() + clockOffset);
      const elapsed = BLUR_GUESS_MS - remaining;
      const ratio = Math.min(1, Math.max(0, elapsed / BLUR_SHARPEN_MS));
      node.style.filter = `blur(${(BLUR_MAX_PX * (1 - ratio)).toFixed(2)}px)`;
      if (ratio < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [deadlineTs, clockOffset, sharp]);

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-card)]"
      style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
    >
      <img
        ref={ref}
        src={src}
        alt=""
        // Contained, not cropped. The portraits are square already, so it costs them nothing —
        // but a flag cut to a square is a different flag, and the round would be asking about
        // a picture it had mangled itself.
        className="block w-full object-contain"
        style={{ aspectRatio: "1 / 1", filter: `blur(${BLUR_MAX_PX}px)` }}
      />
    </div>
  );
}

function BlurResults({ blur }: { blur: BlurView }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-[17px] font-medium">
        C'était <span style={{ color: "var(--color-accent)" }}>{blur.correctAnswer}</span>
      </p>
      <ul className="flex flex-col gap-2">
        {(blur.results ?? []).map((r, i) => (
          <motion.li
            key={r.nickname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: i * 0.06 }}
            className="panel flex items-baseline justify-between gap-4 px-5 py-4"
            {...(r.correct ? { style: { borderColor: "rgba(48,209,88,0.45)" } } : {})}
          >
            <span className="flex items-baseline gap-3">
              <span className="text-[17px] font-medium">{r.nickname}</span>
              <span className="text-[15px]" style={{ color: "var(--color-text-muted)" }}>
                {r.answer}
              </span>
            </span>
            {r.points > 0 && (
              <span className="tabular text-[13px]" style={{ color: "var(--color-success)" }}>
                +{r.points}
              </span>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
