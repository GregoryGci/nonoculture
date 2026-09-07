import { useEffect, useState } from "react";
import {
  BLUFF_MIN_PLAYERS,
  CHAIN_MIN_PLAYERS,
  DUEL_MIN_PLAYERS,
  MAX_CHAIN_ROUNDS,
  MAX_SPECIAL_ROUNDS,
  THEME_LABELS,
  type GameSettings,
} from "@nonoculture/shared";
import { fetchPlayableThemes } from "../lib/api";

const ALL_THEMES = Object.entries(THEME_LABELS).map(([id, label]) => ({ id, label }));

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="tabular text-[17px] font-medium">{value}</span>
      </div>
      {children}
    </div>
  );
}

export function HostSettings({
  settings,
  connectedPlayers,
  onChange,
}: {
  settings: GameSettings;
  connectedPlayers: number;
  onChange: (settings: Partial<GameSettings>) => void;
}) {
  // Some themes exist in the UI but have nothing behind them in the bank (never seeded, or
  // media-only while no media source is bound). Offering them would let the host start an
  // empty game.
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
    onChange({ themes: active ? settings.themes.filter((t) => t !== theme) : [...settings.themes, theme] });
  }

  return (
    <div className="panel flex w-full flex-col gap-7 p-6">
      <Row label="Questions" value={String(settings.questionCount)}>
        <input
          type="range"
          min={5}
          max={40}
          step={1}
          value={settings.questionCount}
          aria-label="Nombre de questions"
          onChange={(e) => onChange({ questionCount: Number(e.target.value) })}
        />
      </Row>

      <Row label="Manches dessinées" value={String(settings.chainRounds)}>
        <input
          type="range"
          min={0}
          max={MAX_CHAIN_ROUNDS}
          step={1}
          value={settings.chainRounds}
          aria-label="Nombre de manches dessinées"
          onChange={(e) => onChange({ chainRounds: Number(e.target.value) })}
        />
        {/* Skipped below three players, which reads as a bug from the lobby unless the rule
            is stated where the game is configured. */}
        {settings.chainRounds > 0 && connectedPlayers < CHAIN_MIN_PLAYERS && (
          <p className="text-[13px]" style={{ color: "var(--color-text-faint)" }}>
            Sautées : {CHAIN_MIN_PLAYERS} joueurs minimum (vous êtes {connectedPlayers})
          </p>
        )}
      </Row>

      <Row label="Manches de bluff" value={String(settings.bluffRounds)}>
        <input
          type="range"
          min={0}
          max={MAX_SPECIAL_ROUNDS}
          step={1}
          value={settings.bluffRounds}
          aria-label="Nombre de manches de bluff"
          onChange={(e) => onChange({ bluffRounds: Number(e.target.value) })}
        />
        {settings.bluffRounds > 0 && connectedPlayers < BLUFF_MIN_PLAYERS && (
          <p className="text-[13px]" style={{ color: "var(--color-text-faint)" }}>
            Sautées : {BLUFF_MIN_PLAYERS} joueurs minimum
          </p>
        )}
      </Row>

      <Row label="Duels" value={String(settings.duelRounds)}>
        <input
          type="range"
          min={0}
          max={MAX_SPECIAL_ROUNDS}
          step={1}
          value={settings.duelRounds}
          aria-label="Nombre de duels"
          onChange={(e) => onChange({ duelRounds: Number(e.target.value) })}
        />
        {settings.duelRounds > 0 && connectedPlayers < DUEL_MIN_PLAYERS && (
          <p className="text-[13px]" style={{ color: "var(--color-text-faint)" }}>
            Sautés : {DUEL_MIN_PLAYERS} joueurs minimum
          </p>
        )}
      </Row>

      <Row label="Questions au plus proche" value={String(settings.numericRounds)}>
        <input
          type="range"
          min={0}
          max={MAX_SPECIAL_ROUNDS}
          step={1}
          value={settings.numericRounds}
          aria-label="Nombre de questions au plus proche"
          onChange={(e) => onChange({ numericRounds: Number(e.target.value) })}
        />
      </Row>

      <Row label="Temps par question" value={`${settings.questionDurationSec}s`}>
        <input
          type="range"
          min={15}
          max={30}
          step={1}
          value={settings.questionDurationSec}
          aria-label="Durée par question en secondes"
          onChange={(e) => onChange({ questionDurationSec: Number(e.target.value) })}
        />
      </Row>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Thèmes</span>
          <span className="text-[13px]" style={{ color: "var(--color-text-faint)" }}>
            {settings.themes.length === 0 ? "tous" : `${settings.themes.length} sélectionnés`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {themes.map(({ id, label }) => {
            const active = settings.themes.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleTheme(id)}
                aria-pressed={active}
                className="h-9 rounded-full px-4 text-[13px] font-medium transition-all duration-300"
                style={{
                  background: active ? "var(--color-accent)" : "transparent",
                  color: active ? "var(--color-accent-contrast)" : "var(--color-text-muted)",
                  border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
