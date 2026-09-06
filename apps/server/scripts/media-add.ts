import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".ogg", ".opus"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv"]);

type MediaKind = "image" | "audio" | "video";

function detectKind(ext: string): MediaKind {
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  throw new Error(`unsupported file extension: ${ext}`);
}

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-y", ...args], { stdio: "inherit" });
}

/** Compresses the input to spec (see docs/brief.md §9) and returns the local output path + R2 key. */
function compress(inputPath: string, kind: MediaKind, outDir: string, key: string): string {
  switch (kind) {
    case "image": {
      const out = join(outDir, `${key}.webp`);
      ffmpeg(["-i", inputPath, "-vf", "scale='min(1280,iw)':-1", "-c:v", "libwebp", "-quality", "80", out]);
      return out;
    }
    case "audio": {
      const out = join(outDir, `${key}.mp3`);
      ffmpeg(["-i", inputPath, "-t", "20", "-c:a", "libmp3lame", "-b:a", "128k", out]);
      return out;
    }
    case "video": {
      const out = join(outDir, `${key}.mp4`);
      ffmpeg([
        "-i",
        inputPath,
        "-t",
        "15",
        "-vf",
        "scale=-2:'min(720,ih)'",
        "-c:v",
        "libx264",
        "-crf",
        "28",
        "-preset",
        "veryslow",
        "-an",
        out,
      ]);
      return out;
    }
  }
}

const SIZE_LIMITS: Record<MediaKind, number> = {
  image: 200 * 1024,
  audio: Infinity, // MP3 @128kbps/20s is inherently small; no hard cap called out in the brief
  video: 3 * 1024 * 1024,
};

function main() {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");
  const inputPath = args.find((a) => !a.startsWith("--"));
  const keyOverrideArg = args.find((a) => a.startsWith("--key="));
  if (!inputPath || !existsSync(inputPath)) {
    console.error("Usage: pnpm media:add <fichier> [--remote] [--key=<r2-key-sans-extension>]");
    process.exit(1);
  }

  const ext = extname(inputPath).toLowerCase();
  const kind = detectKind(ext);
  const key =
    keyOverrideArg?.slice("--key=".length) ??
    `${kind}-${Date.now()}-${basename(inputPath, ext).replace(/[^a-z0-9-]/gi, "_")}`;

  const outDir = mkdtempSync(join(tmpdir(), "quiproquo-media-"));
  console.log(`Compressing ${inputPath} (${kind})...`);
  const outPath = compress(inputPath, kind, outDir, key);

  const sizeBytes = statSync(outPath).size;
  const limit = SIZE_LIMITS[kind];
  if (sizeBytes > limit) {
    console.warn(
      `⚠ output is ${(sizeBytes / 1024).toFixed(0)} KB, over the ${(limit / 1024).toFixed(0)} KB budget from the brief. ` +
        "Consider a shorter clip or lower quality.",
    );
  } else {
    console.log(`Output size: ${(sizeBytes / 1024).toFixed(0)} KB (within budget).`);
  }

  const r2Key = basename(outPath);
  console.log(`Uploading to R2 as "${r2Key}" (${remote ? "remote" : "local"})...`);
  execFileSync(
    "wrangler",
    ["r2", "object", "put", `quiproquo-media/${r2Key}`, `--file=${outPath}`, remote ? "--remote" : "--local"],
    { stdio: "inherit", shell: true },
  );

  console.log(`\nDone. Use this as the question's media_key:\n  ${r2Key}`);
}

main();
