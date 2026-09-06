import { useEffect, useState } from "react";

/**
 * Server-driven countdown. The ring is the primary read (peripheral vision picks up the arc
 * shrinking); the number is the precise one. Under 5s it breathes on opacity — no colour
 * change, no glow, so urgency never breaks the monochrome.
 */
export function Timer({ deadlineTs, total }: { deadlineTs: number | null; total?: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadlineTs === null) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [deadlineTs]);

  if (deadlineTs === null) return null;

  const msLeft = Math.max(0, deadlineTs - now);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const urgent = secondsLeft <= 5;

  const span = total ? total * 1000 : 30_000;
  const progress = Math.max(0, Math.min(1, msLeft / span));
  const size = 44;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={`relative shrink-0 ${urgent ? "timer-urgent" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-text)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 120ms linear" }}
        />
      </svg>
      <span
        className="tabular absolute inset-0 flex items-center justify-center text-sm font-medium"
        aria-live="polite"
      >
        {secondsLeft}
      </span>
    </div>
  );
}
