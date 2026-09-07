import { useEffect, useRef } from "react";

/**
 * Sends whatever is in the box just before the round's timer runs out.
 *
 * Without it, half a second of hesitation threw the answer away: the text was typed, visible
 * on screen, and simply never left the browser because nobody pressed Entrée. The server
 * filled the gap with a blank and moved on. Typing counts now, pressing Entrée is only how
 * you go early.
 *
 * The margin is deliberate. The submission still has to travel to the Durable Object and be
 * accepted before the phase closes, and a flush timed *at* the deadline loses that race on any
 * real connection — a round trip measured around 40 ms here, but a stalled radio is seconds.
 *
 * Empty input sends nothing. There is no such thing as a blank answer worth transmitting, and
 * the state machine already treats "did not answer" as a first-class case.
 */
export const FLUSH_MARGIN_MS = 1_200;

export function useDeadlineFlush({
  deadlineTs,
  clockOffset,
  value,
  locked,
  onFlush,
}: {
  /** Absolute server timestamp the phase ends at, or null when the phase has no countdown. */
  deadlineTs: number | null;
  /** Server clock minus browser clock. Without it the flush fires on the browser's idea of
   *  the deadline, which on a two-second skew is comfortably after the round has closed. */
  clockOffset: number;
  value: string;
  /** Already sent, or not this player's turn — either way there is nothing to flush. */
  locked: boolean;
  onFlush: (value: string) => void;
}): void {
  // Read through refs so the timer is scheduled once per deadline rather than restarted on
  // every keystroke, which would push it further away each time a letter is typed.
  const latest = useRef({ value, locked, onFlush });
  useEffect(() => {
    latest.current = { value, locked, onFlush };
  });

  useEffect(() => {
    if (deadlineTs === null) return;
    const fireIn = deadlineTs - FLUSH_MARGIN_MS - (Date.now() + clockOffset);
    if (fireIn <= 0) return;
    const timer = setTimeout(() => {
      const { value: text, locked: done, onFlush: flush } = latest.current;
      if (done || text.trim().length === 0) return;
      flush(text.trim());
    }, fireIn);
    return () => clearTimeout(timer);
  }, [deadlineTs, clockOffset]);
}
