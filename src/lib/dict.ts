import fs from "node:fs";
import path from "node:path";

/**
 * Dictionary + segmentation layer.
 *
 * Data files are built by scripts/build_data.py from CC-CEDICT (CC BY-SA 4.0)
 * and the complete-hsk-vocabulary dataset (MIT). They are loaded lazily and
 * kept in module scope so a warm serverless instance parses them only once.
 */

type CedictRaw = Record<string, [string, string[]]>;
type HskRaw = Record<string, number>;

export interface Token {
  /** The surface text. */
  t: string;
  /** Pinyin with tone marks. Absent for punctuation, digits and Latin runs. */
  p?: string;
  /** Short gloss, up to a few senses. */
  g?: string[];
  /** HSK level 1-6, or 7 for "beyond HSK6 / not listed". */
  l?: number;
  /** True when the token is Chinese text that can be looked up. */
  z?: boolean;
}

export interface DictEntry {
  word: string;
  pinyin: string;
  defs: string[];
  level: number;
}

let cedict: Map<string, [string, string[]]> | null = null;
let hsk: Map<string, number> | null = null;
let maxWordLen = 1;

function dataPath(file: string): string {
  return path.join(process.cwd(), "data", file);
}

function loadDicts(): void {
  if (cedict && hsk) return;

  const cedictRaw = JSON.parse(
    fs.readFileSync(dataPath("cedict.json"), "utf8"),
  ) as CedictRaw;
  const hskRaw = JSON.parse(
    fs.readFileSync(dataPath("hsk.json"), "utf8"),
  ) as HskRaw;

  cedict = new Map(Object.entries(cedictRaw));
  hsk = new Map(Object.entries(hskRaw));

  for (const word of cedict.keys()) {
    if (word.length > maxWordLen) maxWordLen = word.length;
  }
  // Long dictionary entries are mostly proper nouns and full phrases; capping
  // the match window keeps segmentation from swallowing whole clauses.
  maxWordLen = Math.min(maxWordLen, 6);
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Date and measure units that bind to a preceding number. */
const MEASURE_AFTER_NUMBER = new Set(
  Array.from("日月年号点分秒个次名位岁元角分米公斤吨倍成条张件家所座层届人天周小时"),
);

/** CC-CEDICT capitalises proper-noun pinyin, which is a reliable marker. */
function isProperNoun(entry: DictEntry): boolean {
  const firstSyllable = entry.pinyin.split(/[\s;]+/)[0] ?? "";
  if (firstSyllable && firstSyllable[0] === firstSyllable[0].toUpperCase() &&
      /[A-Za-z\u00C0-\u024F]/.test(firstSyllable[0])) {
    return true;
  }
  const first = entry.defs[0] ?? "";
  return /^(surname|see |variant of|abbr\. for)/i.test(first);
}

/**
 * The first reading only.
 *
 * CC-CEDICT lists every reading of a heteronym ("qīng; Qīng", "háng; héng;
 * xíng"). That is useful in the word panel but wrong above the text: a wide
 * <rt> stretches its base character, which visibly pulls the sentence apart.
 * Senses are ordered so the everyday reading comes first.
 */
export function primaryPinyin(pinyin: string): string {
  return pinyin.split(";")[0].trim();
}

export function isChinese(ch: string): boolean {
  return CJK.test(ch);
}

/** HSK level for a word: 1-6, or 7 when unlisted / beyond HSK6. */
export function levelOf(word: string): number {
  loadDicts();
  return hsk!.get(word) ?? 7;
}

export function lookup(word: string): DictEntry | null {
  loadDicts();
  const hit = cedict!.get(word);
  if (!hit) return null;
  return {
    word,
    pinyin: hit[0],
    defs: hit[1],
    level: levelOf(word),
  };
}

/** Per-character breakdown used by the word popup. */
export function characters(word: string): DictEntry[] {
  loadDicts();
  const out: DictEntry[] = [];
  for (const ch of Array.from(word)) {
    if (!isChinese(ch)) continue;
    const hit = cedict!.get(ch);
    out.push({
      word: ch,
      pinyin: hit?.[0] ?? "",
      defs: hit?.[1] ?? [],
      level: levelOf(ch),
    });
  }
  return out;
}

/**
 * Forward maximum matching against CC-CEDICT.
 *
 * Intl.Segmenter is available but splits common compounds (人民币 -> 人民 + 币,
 * 联谊会 -> 联 + 谊 + 会). Matching against the dictionary keeps those together,
 * which matters because the dictionary is also what supplies the gloss.
 */
export function segment(text: string): string[] {
  loadDicts();
  const chars = Array.from(text);
  const out: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    if (!isChinese(ch)) {
      // Keep runs of Latin letters, digits and spaces together.
      if (/[A-Za-z0-9]/.test(ch)) {
        let j = i;
        let run = "";
        while (j < chars.length && /[A-Za-z0-9.%\-]/.test(chars[j])) {
          run += chars[j];
          j += 1;
        }
        out.push(run);
        i = j;
      } else {
        out.push(ch);
        i += 1;
      }
      continue;
    }

    let matched = "";
    const remaining = chars.length - i;
    const window = Math.min(maxWordLen, remaining);
    for (let len = window; len >= 2; len -= 1) {
      const candidate = chars.slice(i, i + len).join("");
      if (cedict!.has(candidate)) {
        matched = candidate;
        break;
      }
    }
    if (!matched) matched = ch;

    // A measure word or date unit straight after a number belongs to the
    // number, not to whatever follows it. Without this, the very common news
    // dateline "9月20日电" matches the dictionary entry 日电 ("NEC").
    const prev = out[out.length - 1];
    if (
      matched.length > 1 &&
      prev &&
      /^[0-9]+(\.[0-9]+)?$/.test(prev) &&
      MEASURE_AFTER_NUMBER.has(ch)
    ) {
      matched = ch;
    }

    out.push(matched);
    i += Array.from(matched).length;
  }

  return out;
}

/** Segment text and attach pinyin, gloss and HSK level to each token. */
export function annotate(text: string): Token[] {
  loadDicts();
  return segment(text).map((t) => {
    if (!CJK.test(t)) return { t };
    const entry = cedict!.get(t);
    const token: Token = { t, z: true, l: levelOf(t) };
    if (entry) {
      token.p = primaryPinyin(entry[0]);
      token.g = entry[1].slice(0, 3);
    }
    return token;
  });
}

/** Split an article body into paragraphs, then annotate each one. */
export function annotateBody(body: string): Token[][] {
  return body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(annotate);
}

/** Unique Chinese tokens in an article, hardest first. Used for the word list. */
export function vocabulary(paragraphs: Token[][], minLevel = 5): DictEntry[] {
  const seen = new Map<string, DictEntry>();
  for (const para of paragraphs) {
    for (const tok of para) {
      if (!tok.z || seen.has(tok.t)) continue;
      const level = tok.l ?? 7;
      if (level < minLevel) continue;
      const entry = lookup(tok.t);
      if (!entry || !entry.defs.length) continue;
      // Place names, agency names and the reporter's surname are not
      // vocabulary worth studying, even though they are still tappable
      // in the text itself.
      if (isProperNoun(entry)) continue;
      // A lone character is worth listing only when it stands as a word in
      // its own right. Unlisted single characters are nearly always a piece
      // of a name, and bound forms cannot be used alone by definition.
      if (Array.from(tok.t).length === 1) {
        if (level >= 7) continue;
        if (/^\(bound form\)/i.test(entry.defs[0])) continue;
      }
      seen.set(tok.t, { ...entry, pinyin: primaryPinyin(entry.pinyin) });
    }
  }
  return [...seen.values()].sort((a, b) => b.level - a.level);
}
