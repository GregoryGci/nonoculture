/**
 * Turns a media key into the opaque token its URL is served under.
 *
 * `/media/lol-portrait-vex.webp` told anyone with the network tab open what the answer was,
 * on a round whose entire scoring is who knew first. Every image question had the same hole —
 * flags and paintings included — but a fifteen-second race is where it actually pays.
 *
 * What this stops: reading the answer off the URL, and guessing a filename to check it against
 * the token. What it does not stop: a player who writes down token/answer pairs at the reveal
 * and builds their own table over several games. Closing that would mean a fresh token per
 * round, which means routing every media request through the Durable Object — the picture would
 * stop being a cacheable static asset, which is the thing making media free on this account.
 *
 * Synchronous by necessity: `buildStateSync` is not async, and it runs on every state sync.
 * That rules out WebCrypto, so this is FNV-1a over a salted key rather than SHA-256 — a digest,
 * not a signature. Deterministic, so the URL is stable across deploys and stays cacheable.
 */

/** Mixed into every key so a token is not the hash of a filename anyone could guess. */
const SALT = "nonoculture-media-v1:";

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** 16 hex characters of FNV-1a over `SALT + key`. */
export function mediaToken(mediaKey: string): string {
  const bytes = new TextEncoder().encode(SALT + mediaKey);
  let hash = OFFSET;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * The public URL for a media key: the token, keeping the original extension.
 *
 * The extension stays because it tells the browser and the R2 path what the bytes are, and
 * "this is a WebP" was never the secret.
 */
export function mediaUrl(mediaKey: string): string {
  const dot = mediaKey.lastIndexOf(".");
  const ext = dot === -1 ? "" : mediaKey.slice(dot);
  return `/media/${mediaToken(mediaKey)}${ext}`;
}

/** The token out of a `/media/:param` path segment, extension and all. */
export function tokenFromParam(param: string): string {
  const dot = param.lastIndexOf(".");
  return (dot === -1 ? param : param.slice(0, dot)).toLowerCase();
}
