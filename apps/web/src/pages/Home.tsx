import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../lib/api";

export function Home() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      const code = await createRoom();
      void navigate(`/room/${code}`);
    } catch {
      setError("Impossible de créer la partie, réessaie.");
      setCreating(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim();
    if (/^\d{4,5}$/.test(code)) {
      void navigate(`/room/${code}`);
    } else {
      setError("Code invalide (4 ou 5 chiffres).");
    }
  }

  return (
    <div className="phase-enter mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="font-mono text-4xl font-bold tracking-tight">
        Qui<span style={{ color: "var(--color-accent)" }}>pro</span>quo
      </h1>
      <p style={{ color: "var(--color-text-muted)" }}>Le quiz entre potes où on voit toutes vos réponses.</p>

      <button onClick={() => void handleCreate()} disabled={creating} className="btn btn-primary w-full py-3 text-lg">
        {creating ? "Création…" : "Créer une partie"}
      </button>

      <form onSubmit={handleJoin} className="flex w-full gap-2">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          maxLength={5}
          placeholder="Code"
          className="input-cyber font-mono min-h-11 flex-1 rounded-[var(--radius-control)] px-4 text-center text-lg tracking-widest"
        />
        <button type="submit" className="btn btn-secondary">
          Rejoindre
        </button>
      </form>

      {error && <p style={{ color: "var(--color-accent-2)" }}>{error}</p>}
    </div>
  );
}
