import { Hono } from "hono";
import { listPlayableThemes } from "./lib/questions.js";
import { allocateRoomCode, isRoomCodeActive } from "./lib/room-code.js";
import { RateLimiter } from "./lib/rate-limit.js";
import { RoomDO } from "./room/RoomDO.js";

export { RoomDO };

interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  ADMIN_SECRET: string;
  ROOM: DurableObjectNamespace<RoomDO>;
  ASSETS?: { fetch: typeof fetch };
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
  const themes = await listPlayableThemes(c.env.DB, c.env.MEDIA !== undefined);
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

// Public question media (images/audio/video), uploaded via `pnpm media:add`.
app.get("/media/:key", async (c) => {
  if (!c.env.MEDIA) return c.notFound();
  const key = c.req.param("key");
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();
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
