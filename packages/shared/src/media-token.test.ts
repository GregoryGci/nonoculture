import { describe, expect, it } from "vitest";
import { mediaToken, mediaUrl, tokenFromParam } from "./media-token.js";

describe("media tokens", () => {
  it("keeps the key — which names the answer — out of the URL", () => {
    const url = mediaUrl("lol-portrait-vex.webp");
    expect(url).not.toContain("vex");
    expect(url).not.toContain("portrait");
    expect(url).toMatch(/^\/media\/[0-9a-f]{16}\.webp$/);
  });

  it("keeps the extension, because the format was never the secret", () => {
    expect(mediaUrl("son-animal-lion.mp3").endsWith(".mp3")).toBe(true);
    expect(mediaUrl("cle-sans-extension")).toMatch(/^\/media\/[0-9a-f]{16}$/);
  });

  it("round-trips through the path segment the router sees", () => {
    for (const key of ["flag-france.webp", "art-la-joconde.webp", "son-hymne-grece.mp3"]) {
      expect(tokenFromParam(mediaUrl(key).replace("/media/", ""))).toBe(mediaToken(key));
    }
  });

  it("is stable, so a deployed URL stays cacheable", () => {
    expect(mediaToken("flag-france.webp")).toBe(mediaToken("flag-france.webp"));
  });

  it("separates keys that differ by one character", () => {
    expect(mediaToken("lol-portrait-vex.webp")).not.toBe(mediaToken("lol-portrait-vox.webp"));
  });

  it("is not the digest of the bare filename, so a guessed name cannot be checked against it", () => {
    // Whatever an outsider hashes, it is not this without the salt the module carries.
    expect(mediaToken("flag-france.webp")).not.toBe(mediaToken("nonoculture-media-v1:flag-france.webp"));
  });
});
