import { useState } from "react";
import { motion } from "motion/react";

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
    <div className="flex flex-col gap-5">
      {drawingDataUrl ? (
        <motion.img
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          src={drawingDataUrl}
          alt="Dessin à deviner"
          className="mx-auto w-full max-w-sm rounded-[var(--radius-card)]"
          style={{ border: "1px solid var(--color-border)" }}
        />
      ) : (
        <p className="py-8 text-center text-[15px]" style={{ color: "var(--color-text-faint)" }}>
          Personne n&apos;a dessiné à temps.
        </p>
      )}

      {locked ? (
        <p className="waiting py-2 text-center text-[15px] font-medium">En attente des autres…</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
            placeholder="C'est quoi ?"
            aria-label="Ta proposition"
            className="input-cyber h-14 flex-1 rounded-[var(--radius-control)] px-5"
          />
          <button type="submit" disabled={!value.trim()} className="btn btn-primary h-14">
            Valider
          </button>
        </form>
      )}
    </div>
  );
}
