import { useState } from "react";
import { motion } from "motion/react";

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

  if (locked) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="waiting py-6 text-center text-[15px] font-medium"
      >
        En attente des autres…
      </motion.p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-[15px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Donne quelque chose à dessiner à ton voisin.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          placeholder="un chat qui fait du skateboard"
          aria-label="Ton idée à faire dessiner"
          className="input-cyber h-14 flex-1 rounded-[var(--radius-control)] px-5"
        />
        <button type="submit" disabled={!value.trim()} className="btn btn-primary h-14">
          Valider
        </button>
      </form>
    </div>
  );
}
