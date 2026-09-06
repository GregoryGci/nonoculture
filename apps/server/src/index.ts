import { Hono } from "hono";
import { allocateRoomCode, isRoomCodeActive } from "./lib/room-code.js";
import { RateLimiter } from "./lib/rate-limit.js";
import { RoomDO } from "./room/RoomDO.js";

export { RoomDO };

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_SECRET: string;
  ROOM: DurableObjectNamespace<RoomDO>;
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

export default app;
