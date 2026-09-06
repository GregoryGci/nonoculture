import { useState } from "react";

export function AnswerForm({
  alreadyAnswered,
  onSubmit,
}: {
  alreadyAnswered: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [value, setValue] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const locked = alreadyAnswered || justSubmitted;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || locked) return;
    onSubmit(value.trim());
    setJustSubmitted(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        autoFocus
        disabled={locked}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={200}
        placeholder="Ta réponse…"
        className="min-h-11 flex-1 rounded-[var(--radius-control)] px-4 text-base outline-none"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />
      <button
        type="submit"
        disabled={locked || !value.trim()}
        className="min-h-11 min-w-11 rounded-[var(--radius-control)] px-5 font-semibold disabled:opacity-40"
        style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
      >
        {locked ? "Envoyé" : "Valider"}
      </button>
    </form>
  );
}
