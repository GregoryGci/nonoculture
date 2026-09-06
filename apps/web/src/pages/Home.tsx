import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../lib/api";

export function Home() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const code = await createRoom();
      navigate(`/room/${code}`);
    } catch {
      setError("Impossible de créer la partie, réessaie.");
      setCreating(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim();
    if (/^\d{4,5}$/.test(code)) {
      navigate(`/room/${code}`);
    } else {
      setError("Code invalide (4 ou 5 chiffres).");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="text-4xl font-extrabold">
        Qui<span style={{ color: "var(--color-accent)" }}>pro</span>quo
      </h1>
      <p style={{ color: "var(--color-text-muted)" }}>Le quiz entre potes où on voit toutes vos réponses.</p>

      <button
        onClick={handleCreate}
        disabled={creating}
        className="min-h-11 w-full rounded-[var(--radius-card)] px-6 py-3 text-lg font-bold disabled:opacity-60"
        style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
      >
        {creating ? "Création…" : "Créer une partie"}
      </button>

      <form onSubmit={handleJoin} className="flex w-full gap-2">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          maxLength={5}
          placeholder="Code"
          className="min-h-11 flex-1 rounded-[var(--radius-control)] px-4 text-center text-lg tracking-widest outline-none"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        />
        <button
          type="submit"
          className="min-h-11 rounded-[var(--radius-control)] px-6 font-semibold"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          Rejoindre
        </button>
      </form>

      {error && <p style={{ color: "var(--color-accent)" }}>{error}</p>}
    </div>
  );
}
