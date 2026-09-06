const PLAYER_ID_PREFIX = "nonoculture:playerId:";
const PLAYER_TOKEN_PREFIX = "nonoculture:playerToken:";
const LEGACY_KEYS = ["nonoculture:playerId", "nonoculture:playerToken"];

// Identity is scoped per room. Each room's Durable Object mints its own token, so a
// single shared token key would be overwritten on joining a second room and lock the
// player out of the first one (the DO rejects the stale token and closes with 4001).
// Scoping the id too makes rooms fully independent and makes that rejection recoverable:
// we can mint a fresh identity for one room without touching the others.
function idKey(roomCode: string): string {
  return `${PLAYER_ID_PREFIX}${roomCode}`;
}

function tokenKey(roomCode: string): string {
  return `${PLAYER_TOKEN_PREFIX}${roomCode}`;
}

export function getOrCreatePlayerId(roomCode: string): string {
  let id = localStorage.getItem(idKey(roomCode));
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(idKey(roomCode), id);
  }
  return id;
}

export function getPlayerToken(roomCode: string): string | null {
  return localStorage.getItem(tokenKey(roomCode));
}

export function setPlayerToken(roomCode: string, token: string): void {
  localStorage.setItem(tokenKey(roomCode), token);
}

/** Drops this room's credentials so the next connection joins as a brand-new player. */
export function resetRoomIdentity(roomCode: string): void {
  localStorage.removeItem(idKey(roomCode));
  localStorage.removeItem(tokenKey(roomCode));
}

/** One-off cleanup of the pre-per-room global keys, so they can't shadow anything. */
export function migrateLegacyKeys(): void {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}
