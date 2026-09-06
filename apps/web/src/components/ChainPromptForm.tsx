import { useState } from "react";

export function ChainPromptForm({
  alreadySubmitted,
  onSubmit,
}: {
  alreadySubmitted: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const locked = alreadySubmitted || justSubmitted;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || locked) return;
    onSubmit(value.trim());
    setJustSubmitted(true);
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p style={{ color: "var(--color-text-muted)" }}>
        Donne quelque chose à dessiner à ton voisin — un mot, une expression, tout ce qui te passe
        par la tête.
      </p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm gap-2">
        <input
          autoFocus
          disabled={locked}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          placeholder="ex : un chat qui fait du skateboard"
          className="input-cyber min-h-11 flex-1 rounded-[var(--radius-control)] px-4"
        />
        <button type="submit" disabled={locked || !value.trim()} className="btn btn-primary">
          {locked ? "Envoyé" : "Valider"}
        </button>
      </form>
    </div>
  );
}
