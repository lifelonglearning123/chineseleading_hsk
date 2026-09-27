import type { Token } from "./dict";

/** dict.levelOf, passed in so this module has no runtime imports. */
type LevelOf = (word: string) => number;

/**
 * Is this article worth an HSK 4 learner's time?
 *
 * Three questions, answered from the annotated tokens alone so grading costs
 * nothing beyond the segmentation we already do:
 *
 *   How much of it can they read? The share of words at HSK 4 or below.
 *
 *   How many foreign names? A name like 唐纳德·特朗普 is six characters of
 *   sound with no meaning, it teaches nothing, and a page of them is a slog.
 *
 *   How official is it? Wire copy about meetings and policy uses a register
 *   (推进, 部署, 相关部门) that is a poor use of an intermediate learner's time.
 */

/**
 * Bumped whenever the rules below change, so stored grades are redone on the
 * next refresh rather than keeping yesterday's verdict.
 */
export const GRADE_VERSION = 3;

export interface Grade {
  /** GRADE_VERSION at the time of grading. */
  v: number;
  /** Share of Chinese word occurrences at HSK 4 or below, 0-1. */
  coverage: number;
  /** Foreign names per 1000 characters. */
  foreign: number;
  /** Official-register words per 1000 characters. */
  formal: number;
  /** 0-100, higher is easier and more pleasant to read. */
  ease: number;
  /** Passes every threshold, so it belongs in the default list. */
  ok: boolean;
  /** Why it failed, for the "skipped" view. Empty when ok. */
  reasons: string[];
}

/**
 * Below this share of HSK 1-4 words an article is too dense even to rewrite
 * well. The bar looks low, but HSK 1-4 is only about 1,200 words and leaves
 * out everyday words like 同时, 保持 and 地区: light native prose scores
 * 50-75%, a policy report 35-50%. Guokr's best pieces (a poisonous star anise,
 * a bear meme) sit at 51-58%, which is why the bar is not higher. The HSK 4
 * rewrite closes the rest of the gap; the formality and foreign-name checks
 * are what keep policy and world news out.
 */
export const MIN_COVERAGE = 0.5;
/** Roughly one foreign name every 170 characters. */
export const MAX_FOREIGN = 6;
/**
 * Roughly one official-register word every 100 characters. Entertainment and
 * lifestyle pieces sit below 7; festival openings and policy news above 11.
 */
export const MAX_FORMAL = 10;

/**
 * Characters used for sound in transliterated foreign names. Several are also
 * everyday characters (马, 林, 西), so they only count inside a name-shaped
 * token or a run of lone characters, never on their own.
 */
const TRANSLIT = new Set(
  Array.from(
    "阿埃艾爱安奥澳巴拜班邦鲍贝本比彼毕宾波伯博布查达戴丹道德登迪蒂丁杜顿多厄恩尔" +
      "法凡菲费芬弗福夫盖冈戈格贡古瓜哈海汉豪赫亨胡霍基吉加贾杰金卡凯坎康柯科克" +
      "肯库夸奎拉莱兰朗劳勒雷蕾里利莉丽林琳卢鲁路伦罗洛马玛迈麦曼梅门蒙米密缪莫" +
      "默姆穆纳娜奈南内尼妮纽努诺欧帕潘佩皮珀普奇契乔切琼萨塞森沙莎尚舍施斯丝" +
      "松苏索塔泰坦汤唐特提图托瓦万威韦维温沃乌伍西希锡夏谢辛休雅亚扬耶伊因英" +
      "尤约泽詹兹卓佐茨黛娅琪蒂薇奥",
  ),
);

/**
 * The register of meetings, policy and state media. Matched against whole
 * segmented tokens. Everyday words that official prose also leans on (工作,
 * 表示, 坚持, 项目, 积极) are left out: a swimmer saying 坚持 or a sports
 * 项目 is not officialese, and counting them failed light interviews.
 */
const FORMAL = new Set([
  // Government and party
  "政府", "政策", "部门", "相关部门", "国务院", "中央", "党", "党委", "党组",
  "总书记", "书记", "省委", "市委", "县委", "委员会", "委员", "人大", "政协",
  "部长", "副部长", "主席", "总统", "总理", "首相", "官员", "外交", "外长",
  "发言人", "大使", "双边", "多边", "国家主席",
  // The verbs of official prose
  "推进", "推动", "部署", "贯彻", "落实", "深化", "加强", "坚持", "强化",
  "统筹", "构建", "举措", "助力", "赋能", "引领", "聚焦", "着力", "扎实",
  "进一步", "稳步",
  // Meetings and announcements
  "会议", "会谈", "峰会", "论坛", "座谈会", "印发", "规划", "战略", "机制",
  "体系", "召开", "出席", "致辞", "会见", "签署",
  // Economy and trade
  "经济", "贸易", "产业", "投资", "企业", "同比", "环比", "亿元",
  "万亿", "增长率", "高质量", "监管", "市场主体", "营商环境", "关税",
  // Wire-service furniture
  "记者", "据悉", "获悉", "中新网", "中新社", "新华社", "指出", "强调",
]);

/** CC-CEDICT capitalises proper-noun pinyin. */
function isProperNoun(tok: Token): boolean {
  const first = tok.p?.[0];
  return Boolean(first && first !== first.toLowerCase());
}

function allTranslit(word: string): boolean {
  return Array.from(word).every((ch) => TRANSLIT.has(ch));
}

const DOT = /^[·•・‧]$/;

/** Occurrences of foreign names in one paragraph of tokens. */
function countForeign(tokens: Token[]): number {
  let names = 0;

  // 泰勒·斯威夫特: the interpunct only ever joins the parts of a foreign (or
  // minority) personal name. Count each dotted name once, and set its parts
  // aside so the checks below do not count the halves again.
  const consumed = new Array<boolean>(tokens.length).fill(false);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!DOT.test(tokens[i].t)) continue;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (!prev?.z || !next?.z) continue;
    if (!consumed[i - 1]) names += 1; // a later dot in the same name adds nothing
    consumed[i] = true;
    for (let j = i - 1; j >= 0 && tokens[j].z && (j === i - 1 || allTranslit(tokens[j].t)); j -= 1) {
      consumed[j] = true;
    }
    for (let j = i + 1; j < tokens.length && tokens[j].z && (j === i + 1 || allTranslit(tokens[j].t)); j += 1) {
      consumed[j] = true;
    }
  }

  let run = 0; // consecutive lone transliteration characters
  const closeRun = () => {
    if (run >= 3) names += 1;
    run = 0;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (consumed[i] || !tok.z) {
      closeRun();
      continue;
    }
    const len = Array.from(tok.t).length;
    if (len === 1 && TRANSLIT.has(tok.t)) {
      run += 1;
      continue;
    }
    closeRun();
    // A dictionary name made only of sound characters: 伦敦, 特朗普, 马斯克.
    if (len >= 2 && isProperNoun(tok) && allTranslit(tok.t)) names += 1;
  }
  closeRun();
  return names;
}

/**
 * How hard a word is to read. HSK lists 一个, 烟头 and 插线板 nowhere, so the
 * dictionary calls them beyond HSK 6, yet anyone who knows 一 and 个 reads 一个
 * without a pause. An unlisted compound is graded by its hardest character.
 */
function readingLevel(tok: Token, levelOf: LevelOf): number {
  const level = tok.l ?? 7;
  const chars = Array.from(tok.t);
  if (level < 7 || chars.length < 2) return level;
  return Math.max(...chars.map(levelOf));
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function gradeArticle(
  title: Token[],
  paragraphs: Token[][],
  levelOf: LevelOf,
): Grade {
  const all = [title, ...paragraphs];
  let words = 0;
  let easy = 0;
  let chars = 0;
  let formal = 0;
  let foreign = 0;

  for (const para of all) {
    foreign += countForeign(para);
    for (const tok of para) {
      if (!tok.z) continue;
      chars += Array.from(tok.t).length;
      if (FORMAL.has(tok.t)) formal += 1;
      // Names are not vocabulary: a reader skips over 王一博 or 伦敦 whether or
      // not they know them, so they neither help nor hurt coverage.
      if (isProperNoun(tok)) continue;
      words += 1;
      if (readingLevel(tok, levelOf) <= 4) easy += 1;
    }
  }

  const per1000 = (n: number) => (chars ? (n * 1000) / chars : 0);
  const coverage = words ? easy / words : 0;
  const foreignRate = per1000(foreign);
  const formalRate = per1000(formal);

  const reasons: string[] = [];
  if (coverage < MIN_COVERAGE) reasons.push("too hard");
  if (foreignRate > MAX_FOREIGN) reasons.push("foreign names");
  if (formalRate > MAX_FORMAL) reasons.push("too formal");

  // Coverage dominates: the threshold scores 0 and 25 points above it scores
  // 100 before penalties. Names and officialese each take off up to a quarter.
  const base = Math.min(Math.max((coverage - MIN_COVERAGE) / 0.25, 0), 1) * 100;
  const penalty =
    Math.min(foreignRate / MAX_FOREIGN, 1) * 25 +
    Math.min(formalRate / MAX_FORMAL, 1) * 25;
  const ease = Math.round(Math.max(base - penalty, 0));

  return {
    v: GRADE_VERSION,
    coverage: round(coverage, 3),
    foreign: round(foreignRate, 1),
    formal: round(formalRate, 1),
    ease,
    ok: reasons.length === 0,
    reasons,
  };
}
