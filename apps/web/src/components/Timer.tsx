import { useEffect, useState } from "react";

export function Timer({ deadlineTs }: { deadlineTs: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadlineTs === null) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [deadlineTs]);

  if (deadlineTs === null) return null;
  const secondsLeft = Math.max(0, Math.ceil((deadlineTs - now) / 1000));

  return (
    <div
      className="tabular text-3xl font-extrabold"
      style={{ color: secondsLeft <= 5 ? "var(--color-accent)" : "var(--color-text)" }}
      aria-live="polite"
    >
      {secondsLeft}s
    </div>
  );
}
