export async function createRoom(): Promise<string> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error("failed to create room");
  const data = (await res.json()) as { roomCode: string };
  return data.roomCode;
}

/** Themes the question bank can actually field, so the host isn't offered empty ones. */
export async function fetchPlayableThemes(): Promise<string[] | null> {
  try {
    const res = await fetch("/api/themes");
    if (!res.ok) return null;
    const data = (await res.json()) as { themes: string[] };
    return data.themes;
  } catch {
    return null; // offline or the endpoint is down: fall back to showing everything
  }
}

export async function checkRoomActive(code: string): Promise<boolean> {
  const res = await fetch(`/api/rooms/${code}`);
  if (!res.ok) return false;
  const data = (await res.json()) as { active: boolean };
  return data.active;
}
