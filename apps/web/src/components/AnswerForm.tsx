import { useState } from "react";
import { motion } from "motion/react";
import { useDeadlineFlush } from "../hooks/useDeadlineFlush";

export function AnswerForm({
  alreadyAnswered,
  numeric = false,
  deadlineTs,
  clockOffset,
  onSubmit,
}: {
  alreadyAnswered: boolean;
  /** Maths questions: bring up the number pad on a phone, where the race is won or lost. */
  numeric?: boolean;
  deadlineTs: number | null;
  clockOffset: number;
  onSubmit: (answer: string) => void;
}) {
  const [value, setValue] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const locked = alreadyAnswered || justSubmitted;

  useDeadlineFlush({
    deadlineTs,
    clockOffset,
    value,
    locked: locked,
    onFlush: (text) => {
      onSubmit(text);
      setJustSubmitted(true);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || locked) return;
    onSubmit(value.trim());
    setJustSubmitted(true);
  }

  // Once locked the form is replaced entirely — a disabled input still invites typing.
  if (locked) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="panel flex h-14 items-center justify-center gap-2.5 px-5"
      >
        <span style={{ color: "var(--color-success)" }}>✓</span>
        <span className="waiting text-[15px] font-medium">En attente des autres…</span>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={200}
        placeholder={numeric ? "Le résultat…" : "Ta réponse…"}
        aria-label="Ta réponse"
        {...(numeric ? { inputMode: "numeric" as const, autoComplete: "off" } : {})}
        className="input-cyber h-14 flex-1 rounded-[var(--radius-control)] px-5 text-lg"
      />
      <button type="submit" disabled={!value.trim()} className="btn btn-primary h-14 px-7">
        Valider
      </button>
    </form>
  );
}
