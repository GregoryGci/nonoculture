import type { GameSettings } from "@quiproquo/shared";

const ALL_THEMES = [
  "histoire",
  "geo",
  "sciences",
  "cinema",
  "musique",
  "gaming",
  "sport",
  "insolite",
  "animaux",
  "cuisine",
];

export function HostSettings({
  settings,
  onChange,
}: {
  settings: GameSettings;
  onChange: (settings: Partial<GameSettings>) => void;
}) {
  function toggleTheme(theme: string) {
    const active = settings.themes.includes(theme);
    const next = active ? settings.themes.filter((t) => t !== theme) : [...settings.themes, theme];
    onChange({ themes: next });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span style={{ color: "var(--color-text-muted)" }}>Nombre de questions : {settings.questionCount}</span>
        <input
          type="range"
          min={20}
          max={40}
          step={1}
          value={settings.questionCount}
          onChange={(e) => onChange({ questionCount: Number(e.target.value) })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ color: "var(--color-text-muted)" }}>Durée par question : {settings.questionDurationSec}s</span>
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
          {ALL_THEMES.map((theme) => {
            const active = settings.themes.includes(theme);
            return (
              <button
                key={theme}
                type="button"
                onClick={() => toggleTheme(theme)}
                className={`btn ${active ? "btn-primary" : "btn-secondary"} px-3 text-sm capitalize`}
              >
                {theme}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
