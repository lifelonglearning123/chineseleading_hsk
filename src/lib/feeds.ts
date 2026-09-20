/**
 * News ingestion.
 *
 * Source: 中国新闻网 (China News Service, chinanews.com.cn) RSS.
 *
 * Note on sources: People's Daily (people.com.cn/rss/*) did not respond at all
 * during development, and the Xinhua feeds under news.cn still serve XML but
 * have not been updated since December 2022. China News Service is the
 * mainland wire service that still publishes live RSS, so it is the default.
 * Add more feeds to SOURCES below; everything downstream is source-agnostic.
 */

export interface Source {
  id: string;
  label: string;
  labelZh: string;
  url: string;
}

export const SOURCES: Source[] = [
  {
    id: "china",
    label: "China",
    labelZh: "国内",
    url: "https://www.chinanews.com.cn/rss/china.xml",
  },
  {
    id: "world",
    label: "World",
    labelZh: "国际",
    url: "https://www.chinanews.com.cn/rss/world.xml",
  },
  {
    id: "finance",
    label: "Business",
    labelZh: "财经",
    url: "https://www.chinanews.com.cn/rss/finance.xml",
  },
  {
    id: "society",
    label: "Society",
    labelZh: "社会",
    url: "https://www.chinanews.com.cn/rss/society.xml",
  },
  {
    id: "health",
    label: "Health",
    labelZh: "健康",
    url: "https://www.chinanews.com.cn/rss/health.xml",
  },
  {
    id: "edu",
    label: "Education",
    labelZh: "教育",
    url: "https://www.chinanews.com.cn/rss/edu.xml",
  },
  {
    id: "sports",
    label: "Sport",
    labelZh: "体育",
    url: "https://www.chinanews.com.cn/rss/sports.xml",
  },
  {
    id: "life",
    label: "Life",
    labelZh: "生活",
    url: "https://www.chinanews.com.cn/rss/life.xml",
  },
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

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
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

export async function fetchFeed(source: Source): Promise<FeedItem[]> {
  const xml = await fetchText(source.url);
  return parseFeed(xml, source.id);
}

/** Lines that are photo credits or editorial furniture rather than prose. */
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
];

/**
 * Pull the readable body out of a chinanews article page.
 * The prose lives in `div.left_zw`; everything after 【编辑:…】 is furniture.
 */
export function extractBody(html: string): string {
  const start = html.search(/<div[^>]*class="[^"]*left_zw[^"]*"[^>]*>/i);
  let region: string;

  if (start >= 0) {
    region = html.slice(start);
    const cut = region.search(/【编辑|<div[^>]*class="[^"]*(adEditor|left_name|zn_content)/i);
    if (cut > 0) region = region.slice(0, cut);
  } else {
    // Fall back to the whole document if the layout changes.
    const bodyStart = html.search(/<body/i);
    region = bodyStart >= 0 ? html.slice(bodyStart) : html;
    region = region.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, "");
  }

  const text = region
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

export async function fetchArticleBody(url: string): Promise<string> {
  const html = await fetchText(url, 20000);
  return extractBody(html);
}

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}
