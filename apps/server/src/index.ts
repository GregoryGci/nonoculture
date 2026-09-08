import { Hono } from "hono";
import { mediaToken, tokenFromParam } from "@nonoculture/shared";
import { listPlayableThemes } from "./lib/questions.js";
import { allocateRoomCode, isRoomCodeActive } from "./lib/room-code.js";
import { RateLimiter } from "./lib/rate-limit.js";
import { RoomDO } from "./room/RoomDO.js";

export { RoomDO };

interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  ROOM: DurableObjectNamespace<RoomDO>;
  ASSETS?: { fetch: typeof fetch };
}

/** Either binding can serve /media/:key, so either one makes media questions playable. */
function hasMediaSource(env: Env): boolean {
  return env.MEDIA !== undefined || env.ASSETS !== undefined;
}

const app = new Hono<{ Bindings: Env }>();

const createRoomLimiter = new RateLimiter(10, 60_000);

app.post("/api/rooms", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  if (!createRoomLimiter.check(ip, Date.now())) {
    return c.json({ error: "too many rooms created, try again in a minute" }, 429);
  }
  const code = await allocateRoomCode(c.env.DB);
  return c.json({ roomCode: code });
});

app.get("/api/themes", async (c) => {
  const themes = await listPlayableThemes(c.env.DB, hasMediaSource(c.env));
  return c.json({ themes });
});

app.get("/api/rooms/:code", async (c) => {
  const code = c.req.param("code");
  const active = await isRoomCodeActive(c.env.DB, code);
  return c.json({ roomCode: code, active });
});

app.get("/api/rooms/:code/ws", async (c) => {
  const code = c.req.param("code");
  if (!/^\d{4,5}$/.test(code)) {
    return c.json({ error: "invalid room code" }, 400);
  }
  const id = c.env.ROOM.idFromName(code);
  const stub = c.env.ROOM.get(id);
  const url = new URL(c.req.url);
  url.searchParams.set("code", code);
  return stub.fetch(new Request(url, c.req.raw));
});

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

/**
 * Media keys by their public token, built once per isolate.
 *
 * Tokens are a one-way digest, so the only way back is to hash every key the bank knows and
 * keep the table. That is one query over a few hundred distinct rows on the first media
 * request an isolate serves, and nothing after — cheap next to shipping a hash column and a
 * migration to carry it.
 */
let mediaKeysByToken: Map<string, string> | null = null;
let mediaKeysLoadedAt = 0;
/** How stale the table may get before a miss is allowed to pay for a refresh. */
const MEDIA_KEYS_TTL_MS = 60_000;

async function loadMediaKeys(env: Env, now: number): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare("SELECT DISTINCT media_key FROM questions WHERE media_key IS NOT NULL").all<{
    media_key: string;
  }>();
  mediaKeysByToken = new Map((results ?? []).map((row) => [mediaToken(row.media_key), row.media_key]));
  mediaKeysLoadedAt = now;
  return mediaKeysByToken;
}

async function mediaKeyFor(env: Env, token: string): Promise<string | null> {
  const now = Date.now();
  const table = mediaKeysByToken ?? (await loadMediaKeys(env, now));
  const hit = table.get(token);
  if (hit) return hit;
  // A miss is either a bogus token or a question seeded since this isolate warmed up. The
  // second case is what a seed-then-play session looks like, so it is worth one refresh —
  // but behind a cooldown, or a stream of junk tokens would be a stream of D1 queries.
  if (now - mediaKeysLoadedAt < MEDIA_KEYS_TTL_MS) return null;
  return (await loadMediaKeys(env, now)).get(token) ?? null;
}

/**
 * Public question media (images/audio/video), addressed by token rather than by key.
 *
 * The key names the answer — `lol-portrait-vex.webp` — so it never reaches the client; see
 * `mediaUrl` in packages/shared. A file no question points at is unreachable here, which is
 * the correct outcome: nothing else is meant to be served from this route.
 *
 * Two sources, in order: the R2 bucket when one is bound, then the Worker's own static
 * assets (apps/web/public/media/*, shipped with the front-end build). The static path is
 * what makes media work on a plain free account — R2 has to be switched on in the
 * dashboard and asks for a card on file, while Workers assets do not.
 */
app.get("/media/:token", async (c) => {
  const key = await mediaKeyFor(c.env, tokenFromParam(c.req.param("token")));
  if (!key) return c.notFound();
  const object = c.env.MEDIA ? await c.env.MEDIA.get(key) : null;
  if (!object) {
    if (!c.env.ASSETS) return c.notFound();
    const url = new URL(c.req.url);
    url.pathname = `/media/${key}`;
    return c.env.ASSETS.fetch(new Request(url, c.req.raw));
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get("Content-Type")) {
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    headers.set("Content-Type", CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream");
  }
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});

// Everything else (the built React app) is served as static assets in production.
app.get("*", async (c) => {
  if (!c.env.ASSETS) return c.notFound();
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
