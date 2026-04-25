const EMOJI_PATTERN = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const FLAG_PREFIX_PATTERN = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u;

const CATEGORY_RENAMES: Record<string, string> = {
  "YouTube Native Ads (100% Real)": "YouTube Real Views",
  "YouTube Views (100% Real, Never Drop)": "YouTube Real Views",
  "YouTube Views (Bot, Cheaper)": "YouTube Economy Views",
  "YouTube Ranking (Rank On Search)": "YouTube Search Ranking",
  "YouTube SEO (+ Report)": "YouTube SEO",
  "YouTube USA": "YouTube US Traffic",
};

const BLOCKED_COPY_PATTERNS = [
  /provider/gi,
  /theytlab/gi,
  /api\s*provider/gi,
  /reseller/gi,
  /white-?label/gi,
  /upstream/gi,
];

export function cleanServiceText(value: string): string {
  const normalized = value
    .replace(FLAG_PREFIX_PATTERN, "")
    .replace(EMOJI_PATTERN, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  return CATEGORY_RENAMES[normalized] ?? normalized;
}

export function sanitizeServiceDescription(description: string | null | undefined): string | null {
  if (!description) return null;

  let safe = cleanServiceText(description);
  for (const pattern of BLOCKED_COPY_PATTERNS) {
    safe = safe.replace(pattern, "3Flames");
  }

  return safe.trim() || null;
}
