// End-to-end verification of everything that does not need the database.
// Run from the project root so the data/ files resolve.

import { SOURCES, fetchFeed, fetchArticleBody } from "../src/lib/feeds.ts";
import { annotate, annotateBody, vocabulary, lookup, characters } from "../src/lib/dict.ts";

function rule(label: string) {
  console.log("\n" + "=".repeat(64) + "\n" + label + "\n" + "=".repeat(64));
}

async function main() {
  rule("1. FEEDS");
  const source = SOURCES[0];
  const items = await fetchFeed(source);
  console.log(`${source.id}: ${items.length} items`);
  console.log("newest:", items[0].title);
  console.log("date  :", items[0].publishedAt?.toISOString());
  console.log("url   :", items[0].url);

  rule("2. ARTICLE BODY");
  let body = "";
  let used = items[0];
  for (const item of items.slice(0, 4)) {
    body = await fetchArticleBody(item.url);
    if (body.length > 200) {
      used = item;
      break;
    }
  }
  console.log("chars:", body.length);
  console.log("paragraphs:", body.split("\n").length);
  console.log("---- first 240 chars ----");
  console.log(body.slice(0, 240));

  rule("3. ANNOTATION");
  const paras = annotateBody(body);
  const flat = paras.flat();
  const chinese = flat.filter((t) => t.z);
  console.log("tokens:", flat.length, "| chinese:", chinese.length);
  console.log("with pinyin:", chinese.filter((t) => t.p).length);
  const hard = chinese.filter((t) => (t.l ?? 7) > 4);
  console.log("above HSK4:", new Set(hard.map((t) => t.t)).size);
  console.log("\n---- first sentence rendered ----");
  console.log(
    paras[0]
      .slice(0, 28)
      .map((t) => (t.z && t.p && (t.l ?? 7) >= 5 ? `${t.t}[${t.p}]` : t.t))
      .join(""),
  );

  rule("4. VOCAB LIST");
  for (const v of vocabulary(paras).slice(0, 8)) {
    console.log(`  ${v.word}  ${v.pinyin}  (HSK ${v.level >= 7 ? "7+" : v.level})  ${v.defs[0]}`);
  }

  rule("5. LOOKUP + CHARACTERS");
  for (const w of ["人民币", "潜力", "举行"]) {
    const e = lookup(w);
    console.log(`${w}: ${e?.pinyin} | HSK ${e?.level} | ${e?.defs.slice(0, 2).join("; ")}`);
    console.log("   chars:", characters(w).map((c) => `${c.word}=${c.pinyin}`).join(", "));
  }

  rule("6. SEGMENTATION SANITY");
  const probe = annotate("中国人民银行今天宣布下调存款准备金率0.5个百分点。");
  console.log(probe.map((t) => t.t).join(" | "));

  // Hand the chosen article to the AI test.
  return { title: used.title, body };
}

const { title, body } = await main();

rule("7. OPENAI");
if (!process.env.OPENAI_API_KEY) {
  console.log("OPENAI_API_KEY not set, skipping");
} else {
  const { explainWord, simplifyArticle } = await import("../src/lib/ai.ts");

  const t0 = Date.now();
  const ex = await explainWord("举行", "皖台优势产业合作推进会20日在安徽省合肥市举行。", lookup("举行"));
  console.log(`explainWord ok in ${Date.now() - t0}ms`);
  console.log("  meaning     :", ex.meaning);
  console.log("  inContext   :", ex.inContext);
  console.log("  pos/register:", ex.partOfSpeech, "/", ex.register);
  console.log("  characters  :", ex.characters.map((c) => `${c.char}(${c.pinyin})`).join(" "));
  console.log("  collocations:", ex.collocations.map((c) => c.word).join(", "));
  console.log("  example     :", ex.examples[0]?.zh);
  console.log("  confusedWith:", ex.confusedWith.map((c) => c.word).join(", "));
  console.log("  memoryHook  :", ex.memoryHook);

  const t1 = Date.now();
  const simple = await simplifyArticle(title, body, 4);
  console.log(`\nsimplifyArticle ok in ${Date.now() - t1}ms`);
  console.log("  title  :", simple.title);
  console.log("  paras  :", simple.paragraphs.length);
  console.log("  first  :", simple.paragraphs[0]?.slice(0, 160));
  console.log("  summary:", simple.englishSummary);
}
