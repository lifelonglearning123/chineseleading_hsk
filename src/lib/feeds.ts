/**
 * News ingestion.
 *
 * Two publishers, because no single one covers both registers:
 *
 *   中国新闻网 (China News Service) over RSS — wire copy: politics, business,
 *   society, sport, culture. Formal written Chinese.
 *
 *   网易娱乐 (NetEase Entertainment) over its JSON listing — celebrity, film
 *   and TV. Self-media prose, much closer to how people actually write online,
 *   and far more fun to read than a policy announcement.
 *
 * Note on sources that did not work: People's Daily (people.com.cn/rss/*) does
 * not respond at all. The Xinhua feeds under news.cn still serve XML but have
 * not updated since December 2022. Sina's entertainment RSS is frozen in 2018
 * and its listing page renders client-side. NetEase's `newsdata_music.js` is
 * stale since 2022, so only index/star/movie/tv are used.
 */

export type ListingKind = "rss" | "netease";
export type BodyKind = "chinanews" | "netease";

export interface Source {
  id: string;
  label: string;
  labelZh: string;
  url: string;
  listing: ListingKind;
  body: BodyKind;
}

const CNS = (id: string, label: string, labelZh: string): Source => ({
  id,
  label,
  labelZh,
  url: `https://www.chinanews.com.cn/rss/${id}.xml`,
  listing: "rss",
  body: "chinanews",
});

const NETEASE = (
  id: string,
  slug: string,
  label: string,
  labelZh: string,
): Source => ({
  id,
  label,
  labelZh,
  url: `https://ent.163.com/special/000380VU/newsdata_${slug}.js`,
  listing: "netease",
  body: "netease",
});

export const SOURCES: Source[] = [
  // Lighter reading first: this is a learning app, not a newspaper.
  NETEASE("star", "star", "Celebrity", "明星"),
  NETEASE("tv", "tv", "TV drama", "剧集"),
  NETEASE("film", "movie", "Film", "电影"),
  NETEASE("showbiz", "index", "Showbiz", "娱乐"),
  CNS("culture", "Culture", "文化"),
  CNS("society", "Society", "社会"),
  CNS("life", "Life", "生活"),
  CNS("china", "China", "国内"),
  CNS("world", "World", "国际"),
  CNS("finance", "Business", "财经"),
  CNS("sports", "Sport", "体育"),
  CNS("health", "Health", "健康"),
  CNS("edu", "Education", "教育"),
];

export interface FeedItem {
  url: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: Date | null;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

async function fetchText(
  url: string,
  timeoutMs = 15000,
  referer?: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const buf = await res.arrayBuffer();
    return new TextDecoder("utf-8").decode(buf);
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ""));
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? stripTags(m[1]).trim() : "";
}

export function parseFeed(xml: string, sourceId: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of blocks) {
    const link = tag(block, "link");
    const title = tag(block, "title");
    if (!link || !title) continue;

    const rawDate = tag(block, "pubDate");
    const parsed = rawDate ? new Date(rawDate) : null;

    items.push({
      url: link.trim(),
      title,
      summary: tag(block, "description").replace(/\s+/g, " ").trim().slice(0, 400),
      source: sourceId,
      publishedAt: parsed && !Number.isNaN(parsed.valueOf()) ? parsed : null,
    });
  }
  return items;
}

interface NeteaseItem {
  title?: string;
  docurl?: string;
  time?: string;
  keywords?: { keyname?: string }[];
}

/** NetEase timestamps look like "09/21/2026 00:00:17" and are Beijing time. */
function parseNeteaseTime(value: string | undefined): Date | null {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, mi, ss] = m;
  const date = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+08:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

/** The listing is JSONP: `data_callback([...])`. */
export function parseNetease(source: string, body: string): FeedItem[] {
  const m = body.match(/\(\s*(\[[\s\S]*\])\s*\)\s*;?\s*$/);
  if (!m) return [];

  let raw: NeteaseItem[];
  try {
    raw = JSON.parse(m[1]) as NeteaseItem[];
  } catch {
    return [];
  }

  const items: FeedItem[] = [];
  for (const item of raw) {
    const url = item.docurl?.trim();
    const title = item.title?.trim();
    // Some rows link to photo galleries or video pages rather than articles.
    if (!url || !title || !/\/article\//.test(url)) continue;

    const keywords = (item.keywords ?? [])
      .map((k) => k.keyname)
      .filter(Boolean)
      .join(" · ");

    items.push({
      url,
      title,
      summary: keywords.slice(0, 400),
      source,
      publishedAt: parseNeteaseTime(item.time),
    });
  }
  return items;
}

export async function fetchFeed(source: Source): Promise<FeedItem[]> {
  const text = await fetchText(source.url);
  return source.listing === "netease"
    ? parseNetease(source.id, text)
    : parseFeed(text, source.id);
}

/** Lines that are photo credits, boilerplate or editorial furniture. */
const NOISE = [
  /^【编辑[:：]/,
  /^更多精彩内容/,
  /^责任编辑/,
  /^来源[:：]/,
  /^分享到[:：]/,
  /^关注/,
  /^图为/,
  /摄$/,
  /^\(完\)$/,
  /^完$/,
  // NetEase self-media intros and footers.
  /^我是小编/,
  /^本文由.{0,20}原创/,
  /^声明[:：]/,
  /^免责声明/,
  /^,?图片(来源|均来自)/,
  /^原创不易/,
  /^关注我/,
  /举报\/反馈/,
  /^特别声明/,
];

interface BodyRegion {
  start: RegExp;
  stop: RegExp;
}

const REGIONS: Record<BodyKind, BodyRegion> = {
  chinanews: {
    start: /<div[^>]*class="[^"]*left_zw[^"]*"[^>]*>/i,
    stop: /【编辑|<div[^>]*class="[^"]*(adEditor|left_name|zn_content)/i,
  },
  netease: {
    start: /<div[^>]*class="[^"]*post_body[^"]*"[^>]*>/i,
    stop: /class="[^"]*(post_statement|post_next|post_recommend|post_crumb)/i,
  },
};

/**
 * Pull the readable prose out of an article page. Each publisher wraps its
 * body in its own container, so the caller says which one to expect; if that
 * container is missing we fall back to stripping the whole document.
 */
export function extractBody(html: string, kind: BodyKind = "chinanews"): string {
  const region = REGIONS[kind] ?? REGIONS.chinanews;
  const start = html.search(region.start);
  let slice: string;

  if (start >= 0) {
    slice = html.slice(start);
    const cut = slice.search(region.stop);
    if (cut > 0) slice = slice.slice(0, cut);
  } else {
    const bodyStart = html.search(/<body/i);
    slice = bodyStart >= 0 ? html.slice(bodyStart) : html;
    slice = slice.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, "");
  }

  const text = slice
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|br|h\d|li)[^>]*>/gi, "\n")
    .replace(/<br[^>]*>/gi, "\n");

  return stripTags(text)
    .split(/\n+/)
    .map((line) => line.replace(/[　\s]+/g, " ").trim())
    .filter((line) => {
      if (line.length < 8) return false;
      if (!/[一-鿿]/.test(line)) return false;
      return !NOISE.some((re) => re.test(line));
    })
    .join("\n")
    .trim();
}

export async function fetchArticleBody(
  url: string,
  kind: BodyKind = "chinanews",
): Promise<string> {
  const referer = kind === "netease" ? "https://ent.163.com/" : undefined;
  const html = await fetchText(url, 20000, referer);
  return extractBody(html, kind);
}

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** Body strategy for an article whose source row we already have. */
export function bodyKindFor(sourceId: string): BodyKind {
  return sourceById(sourceId)?.body ?? "chinanews";
}

/** Run tasks with a small concurrency cap, so a refresh of 13 feeds is quick. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
