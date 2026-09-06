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
        className="input-cyber min-h-14 flex-1 rounded-[var(--radius-control)] px-5 text-lg"
      />
      <button type="submit" disabled={locked || !value.trim()} className="btn btn-primary min-h-14 px-8 text-lg">
        {locked ? "Envoyé" : "Valider"}
      </button>
    </form>
  );
}
