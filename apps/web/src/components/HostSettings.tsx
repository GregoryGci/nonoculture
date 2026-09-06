import { useEffect, useState } from "react";
import type { GameSettings } from "@quiproquo/shared";
import { fetchPlayableThemes } from "../lib/api";

const ALL_THEMES: { id: string; icon: string }[] = [
  { id: "histoire", icon: "📜" },
  { id: "geo", icon: "🌍" },
  { id: "sciences", icon: "🔬" },
  { id: "cinema", icon: "🎬" },
  { id: "musique", icon: "🎵" },
  { id: "gaming", icon: "🎮" },
  { id: "sport", icon: "⚽" },
  { id: "insolite", icon: "🌀" },
  { id: "animaux", icon: "🐾" },
  { id: "cuisine", icon: "🍳" },
  { id: "litterature", icon: "📚" },
  { id: "technologie", icon: "💻" },
];

export function HostSettings({
  settings,
  onChange,
}: {
  settings: GameSettings;
  onChange: (settings: Partial<GameSettings>) => void;
}) {
  // Some themes exist in the UI but have nothing behind them in the bank (never seeded, or
  // media-only while R2 is unbound). Offering them would let the host start an empty game.
  const [playable, setPlayable] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPlayableThemes().then((themes) => {
      if (alive) setPlayable(themes);
    });
    return () => {
      alive = false;
    };
  }, []);
  const themes = playable ? ALL_THEMES.filter((t) => playable.includes(t.id)) : ALL_THEMES;

  function toggleTheme(theme: string) {
    const active = settings.themes.includes(theme);
    const next = active ? settings.themes.filter((t) => t !== theme) : [...settings.themes, theme];
    onChange({ themes: next });
  }

  return (
    <div className="panel flex w-full flex-col gap-5 p-5">
      <h2 className="font-mono text-sm font-bold tracking-wide uppercase" style={{ color: "var(--color-text-muted)" }}>
        Réglages de la partie
      </h2>

      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between">
          <span style={{ color: "var(--color-text-muted)" }}>Nombre de questions</span>
          <span className="tabular font-bold" style={{ color: "var(--color-accent)" }}>
            {settings.questionCount}
          </span>
        </span>
        <input
          type="range"
          min={20}
          max={40}
          step={1}
          value={settings.questionCount}
          onChange={(e) => onChange({ questionCount: Number(e.target.value) })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between">
          <span style={{ color: "var(--color-text-muted)" }}>Durée par question</span>
          <span className="tabular font-bold" style={{ color: "var(--color-accent)" }}>
            {settings.questionDurationSec}s
          </span>
        </span>
        <input
          type="range"
          min={15}
          max={30}
          step={1}
          value={settings.questionDurationSec}
          onChange={(e) => onChange({ questionDurationSec: Number(e.target.value) })}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span style={{ color: "var(--color-text-muted)" }}>Thèmes (tous si aucun sélectionné)</span>
        <div className="flex flex-wrap gap-2">
          {themes.map(({ id, icon }) => {
            const active = settings.themes.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleTheme(id)}
                className={`btn ${active ? "btn-primary" : "btn-secondary"} px-3 text-sm capitalize`}
              >
                <span aria-hidden>{icon}</span> {id}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
