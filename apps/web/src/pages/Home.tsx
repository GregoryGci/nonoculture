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
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="stagger flex flex-col items-center text-center">
        <p className="eyebrow">Quiz party</p>

        <h1 className="display mt-5 text-[clamp(3rem,14vw,4.5rem)]">Quiproquo</h1>

        <p className="mt-5 max-w-xs text-[17px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          Réponses libres, corrigées par l&apos;hôte. Tout le monde voit tout à la fin.
        </p>

        <div className="mt-12 w-full">
          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className="btn btn-primary h-14 w-full text-base"
          >
            {creating ? "Création…" : "Créer une partie"}
          </button>
        </div>

        <div className="mt-8 flex w-full items-center gap-4">
          <hr className="divider flex-1" />
          <span className="eyebrow">ou rejoindre</span>
          <hr className="divider flex-1" />
        </div>

        <form onSubmit={handleJoin} className="mt-8 flex w-full gap-2">
          <input
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            inputMode="numeric"
            maxLength={5}
            placeholder="Code"
            aria-label="Code de la partie"
            className="input-cyber h-14 flex-1 rounded-[var(--radius-control)] px-5 text-center text-2xl font-medium tracking-[0.3em]"
          />
          <button type="submit" disabled={joinCode.length < 4} className="btn btn-secondary h-14">
            Rejoindre
          </button>
        </form>

        <p
          className="mt-6 min-h-5 text-sm transition-opacity duration-300"
          style={{ color: "var(--color-danger)", opacity: error ? 1 : 0 }}
          role="status"
        >
          {error ?? " "}
        </p>
      </div>
    </div>
  );
}
