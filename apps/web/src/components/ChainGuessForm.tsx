import { useState } from "react";

export function ChainGuessForm({
  drawingDataUrl,
  alreadySubmitted,
  onSubmit,
}: {
  drawingDataUrl: string;
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
      <p style={{ color: "var(--color-text-muted)" }}>Devine ce que ton voisin a dessiné.</p>
      {drawingDataUrl ? (
        <img
          src={drawingDataUrl}
          alt="Dessin à deviner"
          className="max-w-full rounded-[var(--radius-card)]"
          style={{ border: "1px solid var(--color-border)" }}
        />
      ) : (
        <p style={{ color: "var(--color-text-muted)" }}>(personne n'a dessiné à temps)</p>
      )}
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm gap-2">
        <input
          autoFocus
          disabled={locked}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          placeholder="Ta proposition…"
          className="min-h-11 flex-1 rounded-[var(--radius-control)] px-4 outline-none"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        />
        <button
          type="submit"
          disabled={locked || !value.trim()}
          className="min-h-11 rounded-[var(--radius-control)] px-5 font-semibold disabled:opacity-40"
          style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
        >
          {locked ? "Envoyé" : "Valider"}
        </button>
      </form>
    </div>
  );
}
