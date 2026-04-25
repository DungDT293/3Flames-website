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

const VI_SERVICE_TERMS: Array<[RegExp, string]> = [
  [/YouTube Channel Automation/gi, "Tự động hoá kênh YouTube"],
  [/YouTube US Traffic/gi, "Lưu lượng YouTube từ Mỹ"],
  [/YouTube Search Ranking/gi, "Xếp hạng tìm kiếm YouTube"],
  [/YouTube Real Views/gi, "Lượt xem YouTube thật"],
  [/YouTube Economy Views/gi, "Lượt xem YouTube tiết kiệm"],
  [/YouTube High Retention Views/gi, "Lượt xem YouTube giữ chân cao"],
  [/YouTube Watch Hours/gi, "Giờ xem YouTube"],
  [/YouTube Community Post/gi, "Bài đăng cộng đồng YouTube"],
  [/YouTube Livestream/gi, "Livestream YouTube"],
  [/YouTube Subscribers/gi, "Người đăng ký YouTube"],
  [/YouTube Comments/gi, "Bình luận YouTube"],
  [/YouTube Likes/gi, "Lượt thích YouTube"],
  [/Facebook Page\/Profile Followers/gi, "Theo dõi trang/hồ sơ Facebook"],
  [/Facebook Post Likes/gi, "Lượt thích bài viết Facebook"],
  [/Facebook Video Views/gi, "Lượt xem video Facebook"],
  [/Facebook Likes/gi, "Lượt thích Facebook"],
  [/Followers/gi, "Người theo dõi"],
  [/Subscribers/gi, "Người đăng ký"],
  [/Comments/gi, "Bình luận"],
  [/Shares/gi, "Chia sẻ"],
  [/Likes/gi, "Lượt thích"],
  [/Views/gi, "Lượt xem"],
  [/Watch Hours/gi, "Giờ xem"],
  [/Monthly Engagement/gi, "Tương tác hằng tháng"],
  [/Engagement/gi, "Tương tác"],
  [/Automated/gi, "Tự động"],
  [/Lifetime/gi, "Trọn đời"],
  [/Real people/gi, "Người thật"],
  [/Real/gi, "Thật"],
  [/Mix/gi, "Tổng hợp"],
  [/Default/gi, "Mặc định"],
];

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

export function localizeServiceText(value: string, language: "vi" | "en"): string {
  let text = cleanServiceText(value);
  if (language !== "vi") return text;

  for (const [pattern, replacement] of VI_SERVICE_TERMS) {
    text = text.replace(pattern, replacement);
  }

  return text;
}

export function servicePlatform(value: string): "facebook" | "youtube" | "other" {
  const text = cleanServiceText(value).toLowerCase();
  if (text.includes("facebook") || text.includes("fb")) return "facebook";
  if (text.includes("youtube") || text.includes("yt")) return "youtube";
  return "other";
}

export function sanitizeServiceDescription(description: string | null | undefined, language: "vi" | "en" = "en"): string | null {
  if (!description) return null;

  let safe = cleanServiceText(description);
  for (const pattern of BLOCKED_COPY_PATTERNS) {
    safe = safe.replace(pattern, "3Flames");
  }

  return localizeServiceText(safe, language).trim() || null;
}
