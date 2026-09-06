const PLAYER_ID_KEY = "quiproquo:playerId";
const PLAYER_TOKEN_KEY = "quiproquo:playerToken";

export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function getPlayerToken(): string | null {
  return localStorage.getItem(PLAYER_TOKEN_KEY);
}

export function setPlayerToken(token: string): void {
  localStorage.setItem(PLAYER_TOKEN_KEY, token);
}
