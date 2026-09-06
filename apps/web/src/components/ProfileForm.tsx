import { useState } from "react";
import { AVATARS, Avatar } from "./Avatar";

export function ProfileForm({ onSubmit }: { onSubmit: (nickname: string, avatar: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]!.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    onSubmit(nickname.trim().slice(0, 16), avatar);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h2 className="font-mono text-center text-xl" style={{ color: "var(--color-text-muted)" }}>
        Crée ton personnage
      </h2>
      <input
        autoFocus
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={16}
        placeholder="Ton pseudo"
        className="input-cyber min-h-11 rounded-[var(--radius-control)] px-4 text-center text-lg"
      />
      <div className="grid grid-cols-4 gap-3">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAvatar(a.id)}
            className="avatar-pick p-2"
            style={{
              background: "var(--color-surface)",
              border: `2px solid ${a.id === avatar ? "var(--color-accent)" : "var(--color-border)"}`,
              boxShadow: a.id === avatar ? "0 0 14px color-mix(in srgb, var(--color-accent) 55%, transparent)" : "none",
            }}
            aria-pressed={a.id === avatar}
            title={a.label}
          >
            <Avatar id={a.id} size={44} />
          </button>
        ))}
      </div>
      <button type="submit" disabled={!nickname.trim()} className="btn btn-primary">
        Entrer dans le salon
      </button>
    </form>
  );
}
