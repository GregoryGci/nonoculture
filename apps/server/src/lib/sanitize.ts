/** Strip HTML tags and control characters, then enforce a max length. Defense in depth on top of Zod. */
export function sanitizeText(input: string, maxLen: number): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

export function sanitizeNickname(input: string): string {
  const clean = sanitizeText(input, 16);
  return clean.length > 0 ? clean : "Joueur";
}
