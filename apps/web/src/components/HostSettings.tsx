import { useEffect, useState } from "react";
import {
  BLUFF_MIN_PLAYERS,
  CHAIN_MIN_PLAYERS,
  DUEL_MIN_PLAYERS,
  REFLEX_MIN_PLAYERS,
  MAX_CHAIN_ROUNDS,
  MAX_SPECIAL_ROUNDS,
  THEME_LABELS,
  type GameSettings,
} from "@nonoculture/shared";
import { fetchPlayableThemes } from "../lib/api";

const ALL_THEMES = Object.entries(THEME_LABELS).map(([id, label]) => ({ id, label }));

/**
 * The special rounds, described once.
 *
 * They were seven identical sliders in a flat stack, which told the host how many of each to
 * take but never what any of them was — "Manches de bluff : 2" means nothing until you have
 * played one. Each row now carries its own sentence, and it keeps that sentence even when the
 * round would be skipped: the first attempt replaced it with the minimum-players warning, so
 * a host playing alone was told four times that rounds would be skipped and never once what
 * any of them did.
 */
const SPECIAL_ROUNDS = [
  {
    key: "chainRounds",
    label: "Téléphone dessiné",
    blurb: "Un mot, un dessin, une devinette — en chaîne.",
    max: MAX_CHAIN_ROUNDS,
    minPlayers: CHAIN_MIN_PLAYERS,
  },
  {
    key: "bluffRounds",
    label: "Bluff",
    blurb: "Invente une fausse réponse, démasque la vraie.",
    max: MAX_SPECIAL_ROUNDS,
    minPlayers: BLUFF_MIN_PLAYERS,
  },
  {
    key: "duelRounds",
    label: "Duel",
    blurb: "Deux joueurs citent un maximum, les autres parient.",
    max: MAX_SPECIAL_ROUNDS,
    minPlayers: DUEL_MIN_PLAYERS,
  },
  {
    key: "reflexRounds",
    label: "Réflexe",
    blurb: "L'écran passe au vert, le premier à taper gagne.",
    max: MAX_SPECIAL_ROUNDS,
    minPlayers: REFLEX_MIN_PLAYERS,
  },
  {
    key: "numericRounds",
    label: "Le plus proche gagne",
    blurb: "Une question chiffrée, la réponse la plus proche marque.",
    max: MAX_SPECIAL_ROUNDS,
    minPlayers: 0,
  },
] as const satisfies readonly {
  key: keyof GameSettings;
  label: string;
  blurb: string;
  max: number;
  minPlayers: number;
}[];

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="eyebrow">{title}</h3>
        {aside && (
          <span className="tabular text-[13px]" style={{ color: "var(--color-text-faint)" }}>
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px]">{label}</span>
        <span className="tabular text-[17px] font-medium">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={Number(value.replace(/\D/g, ""))}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** A 0–6 count is a stepper, not a slider: fewer pixels, no dragging, exact on a phone. */
function Stepper({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (n: number) => void;
}) {
  const button = (delta: number, symbol: string, name: string, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(Math.min(max, Math.max(0, value + delta)))}
      aria-label={`${name} — ${label}`}
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-[17px] transition-colors duration-200"
      style={{
        border: `1px solid ${disabled ? "var(--color-border)" : "var(--color-border-strong)"}`,
        color: disabled ? "var(--color-text-faint)" : "var(--color-text)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {symbol}
    </button>
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      {button(-1, "−", "Retirer une manche", value <= 0)}
      <span
        className="tabular w-6 text-center text-[17px] font-medium"
        style={{ color: value === 0 ? "var(--color-text-faint)" : "var(--color-text)" }}
      >
        {value}
      </span>
      {button(1, "+", "Ajouter une manche", value >= max)}
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
  const [themesOpen, setThemesOpen] = useState(false);
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

  // Special rounds eat into questionCount rather than adding to it — a fact the old layout
  // hid completely, so a host could ask for 25 questions, take 10 special rounds and wonder
  // where the trivia went.
  const specialTotal = SPECIAL_ROUNDS.reduce((n, r) => n + settings[r.key], 0);
  const triviaSlots = Math.max(0, settings.questionCount - specialTotal);
  const overBooked = specialTotal > settings.questionCount - 2;
  const skippedRounds = SPECIAL_ROUNDS.filter((r) => settings[r.key] > 0 && connectedPlayers < r.minPlayers).map((r) =>
    r.label.toLowerCase(),
  );

  const selectedLabel =
    settings.themes.length === 0 ? `Tous (${themes.length})` : `${settings.themes.length} sur ${themes.length}`;

  return (
    <div className="panel flex w-full flex-col gap-8 p-6">
      {/* The shape of the run, in one line, before any of the controls that produce it. */}
      <div className="flex flex-col gap-1">
        <p className="display text-[19px]">
          {triviaSlots} question{triviaSlots > 1 ? "s" : ""}
          {specialTotal > 0 &&
            ` · ${specialTotal} manche${specialTotal > 1 ? "s" : ""} spéciale${specialTotal > 1 ? "s" : ""}`}
        </p>
        <p className="text-[13px]" style={{ color: overBooked ? "var(--color-danger)" : "var(--color-text-faint)" }}>
          {overBooked
            ? "Trop de manches spéciales pour la longueur choisie : le surplus sera ignoré."
            : `${settings.questionCount} tours au total, environ ${Math.round((settings.questionCount * settings.questionDurationSec) / 60) + specialTotal} min de partie.`}
        </p>
      </div>

      <Section title="La partie">
        <SliderRow
          label="Longueur"
          value={String(settings.questionCount)}
          min={5}
          max={40}
          onChange={(n) => onChange({ questionCount: n })}
        />
        <SliderRow
          label="Temps par question"
          value={`${settings.questionDurationSec}s`}
          min={15}
          max={30}
          onChange={(n) => onChange({ questionDurationSec: n })}
        />
      </Section>

      <Section
        title="Manches spéciales"
        aside={specialTotal === 0 ? "aucune" : `${specialTotal} sur ${settings.questionCount}`}
      >
        {/* One notice for the whole section rather than the same sentence repeated on four
            rows — which is what buried the description of what each round actually is. */}
        {skippedRounds.length > 0 && (
          <p
            className="rounded-[var(--radius-control)] px-3.5 py-2.5 text-[13px] leading-snug"
            style={{ background: "rgba(255,159,10,0.1)", color: "var(--color-text-muted)" }}
          >
            Vous êtes {connectedPlayers} : {skippedRounds.join(", ")}{" "}
            {skippedRounds.length > 1 ? "seront sautées" : "sera sautée"} tant qu'il n'y a pas assez de monde.
          </p>
        )}
        <div className="flex flex-col">
          {SPECIAL_ROUNDS.map((round, i) => {
            const value = settings[round.key];
            const skipped = value > 0 && connectedPlayers < round.minPlayers;
            return (
              <div
                key={round.key}
                className="flex items-center justify-between gap-4 py-3.5"
                style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-[15px] font-medium">
                    {round.label}
                    {skipped && (
                      <span
                        aria-label="sautée, pas assez de joueurs"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: "#ff9f0a" }}
                      />
                    )}
                  </span>
                  <span className="text-[13px] leading-snug" style={{ color: "var(--color-text-faint)" }}>
                    {round.blurb}
                  </span>
                </div>
                <Stepper
                  value={value}
                  max={round.max}
                  label={round.label}
                  onChange={(n) => onChange({ [round.key]: n })}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Thèmes" aside={selectedLabel}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setThemesOpen((o) => !o)}
            aria-expanded={themesOpen}
            className="btn btn-secondary h-11 flex-1 text-[15px]"
          >
            {themesOpen ? "Replier" : "Choisir les thèmes"}
          </button>
          {settings.themes.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ themes: [] })}
              className="btn btn-ghost h-11 px-4 text-[15px]"
            >
              Tout
            </button>
          )}
        </div>

        {themesOpen && (
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
        )}

        {!themesOpen && settings.themes.length > 0 && (
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            {settings.themes.map((id) => THEME_LABELS[id] ?? id).join(" · ")}
          </p>
        )}
      </Section>
    </div>
  );
}
