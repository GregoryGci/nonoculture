const MAX_ATTEMPTS_PER_LENGTH = 30;
/** LOBBY can sit open a while before a game starts; a code stays reserved this long by default. */
const DEFAULT_RESERVATION_MS = 6 * 60 * 60 * 1000;

function randomCode(digits: number): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(min + Math.floor(Math.random() * (max - min))).padStart(digits, "0");
}

async function isCodeFree(db: D1Database, code: string, now: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT expires_at FROM room_codes WHERE code = ?")
    .bind(code)
    .first<{ expires_at: number }>();
  return !row || row.expires_at < now;
}

/** Allocates a fresh, unused room code (4 digits, falling back to 5 if the pool is saturated). */
export async function allocateRoomCode(db: D1Database, now = Date.now()): Promise<string> {
  for (const digits of [4, 5]) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_LENGTH; attempt++) {
      const code = randomCode(digits);
      if (await isCodeFree(db, code, now)) {
        await db
          .prepare(
            "INSERT INTO room_codes (code, created_at, expires_at) VALUES (?, ?, ?) " +
              "ON CONFLICT(code) DO UPDATE SET created_at = excluded.created_at, expires_at = excluded.expires_at",
          )
          .bind(code, now, now + DEFAULT_RESERVATION_MS)
          .run();
        return code;
      }
    }
  }
  throw new Error("room code pool exhausted");
}

export async function isRoomCodeActive(db: D1Database, code: string, now = Date.now()): Promise<boolean> {
  return !(await isCodeFree(db, code, now));
}

export async function setRoomCodeExpiry(db: D1Database, code: string, expiresAt: number): Promise<void> {
  await db.prepare("UPDATE room_codes SET expires_at = ? WHERE code = ?").bind(expiresAt, code).run();
}
