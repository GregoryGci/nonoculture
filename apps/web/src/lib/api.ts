export async function createRoom(): Promise<string> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error("failed to create room");
  const data = (await res.json()) as { roomCode: string };
  return data.roomCode;
}

export async function checkRoomActive(code: string): Promise<boolean> {
  const res = await fetch(`/api/rooms/${code}`);
  if (!res.ok) return false;
  const data = (await res.json()) as { active: boolean };
  return data.active;
}
