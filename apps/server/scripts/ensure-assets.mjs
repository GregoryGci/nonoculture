// wrangler refuses to boot when the [assets] directory in wrangler.toml is missing, which
// on a fresh clone means `pnpm dev` fails before the API is even up — even though the front
// end runs on its own Vite dev server locally and never touches this directory.
// A placeholder is enough to get out of the way; `pnpm --filter web build` overwrites it.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dirname, "..", "..", "web", "dist");
const index = join(dist, "index.html");

if (!existsSync(index)) {
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    index,
    "<!doctype html><meta charset=utf-8><title>Quiproquo</title>" +
      "<p>Placeholder. En dev le front tourne sur Vite (pnpm --filter web dev). " +
      "Pour servir le vrai front depuis le Worker : pnpm --filter web build.</p>",
    "utf-8",
  );
  console.log("[ensure-assets] placeholder apps/web/dist/index.html créé");
}
