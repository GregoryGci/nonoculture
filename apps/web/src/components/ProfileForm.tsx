import { useState } from "react";

const AVATARS = ["🦊", "🐼", "🐸", "🦉", "🐙", "🦄", "🐯", "🐧", "🦁", "🐨", "🐵", "🦖"];

export function ProfileForm({ onSubmit }: { onSubmit: (nickname: string, avatar: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]!);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    onSubmit(nickname.trim().slice(0, 16), avatar);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <input
        autoFocus
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={16}
        placeholder="Ton pseudo"
        className="min-h-11 rounded-[var(--radius-control)] px-4 text-center text-lg outline-none"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
      />
      <div className="grid grid-cols-6 gap-2">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAvatar(a)}
            className="min-h-11 rounded-[var(--radius-control)] text-2xl"
            style={{
              background: "var(--color-surface)",
              border: `2px solid ${a === avatar ? "var(--color-accent)" : "var(--color-border)"}`,
            }}
            aria-pressed={a === avatar}
          >
            {a}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={!nickname.trim()}
        className="min-h-11 rounded-[var(--radius-control)] px-6 font-bold disabled:opacity-40"
        style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
      >
        Entrer dans le salon
      </button>
    </form>
  );
}
