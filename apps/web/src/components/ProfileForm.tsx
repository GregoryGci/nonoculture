import { useState } from "react";
import { Avatar } from "./Avatar";
import { AVATARS } from "../lib/avatars";

export function ProfileForm({ onSubmit }: { onSubmit: (nickname: string, avatar: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]!.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    onSubmit(nickname.trim().slice(0, 16), avatar);
  }

  return (
    <form onSubmit={handleSubmit} className="stagger flex w-full max-w-sm flex-col items-center">
      <p className="eyebrow">Ton profil</p>

      {/* The chosen avatar is the hero: large, and it cross-fades as you pick. */}
      <div className="mt-8">
        <Avatar key={avatar} id={avatar} size={112} className="pop-in" />
      </div>

      <input
        autoFocus
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={16}
        placeholder="Ton pseudo"
        aria-label="Ton pseudo"
        className="input-cyber mt-8 h-14 w-full rounded-[var(--radius-control)] px-5 text-center text-lg font-medium"
      />

      <div className="mt-6 grid w-full grid-cols-6 gap-2">
        {AVATARS.map((a) => {
          const selected = a.id === avatar;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAvatar(a.id)}
              className="flex aspect-square items-center justify-center rounded-[var(--radius-control)] transition-all duration-300"
              style={{
                background: selected ? "var(--color-surface-2)" : "transparent",
                border: `1px solid ${selected ? "var(--color-border-strong)" : "transparent"}`,
                opacity: selected ? 1 : 0.5,
              }}
              aria-pressed={selected}
              aria-label={a.label}
              title={a.label}
            >
              <Avatar id={a.id} size={34} />
            </button>
          );
        })}
      </div>

      <button type="submit" disabled={!nickname.trim()} className="btn btn-primary mt-8 h-14 w-full text-base">
        Entrer
      </button>
    </form>
  );
}
