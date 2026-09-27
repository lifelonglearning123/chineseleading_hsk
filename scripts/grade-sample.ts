// Score a few live articles from each source, to calibrate src/lib/grade.ts.
// Usage: node scripts/grade-sample.ts [perSource] [sourceId...]

import { SOURCES, fetchFeed, fetchArticleBody, mapLimit } from "../src/lib/feeds.ts";
import { annotate, annotateBody, levelOf } from "../src/lib/dict.ts";
import { gradeArticle } from "../src/lib/grade.ts";

const [perArg, ...only] = process.argv.slice(2);
const per = Number(perArg ?? 5);
const sources = only.length ? SOURCES.filter((s) => only.includes(s.id)) : SOURCES;

for (const source of sources) {
  let items;
  try {
    items = (await fetchFeed(source)).slice(0, per);
  } catch (err) {
    console.log(`\n## ${source.id}: listing failed, ${(err as Error).message}`);
    continue;
  }
  const rows = await mapLimit(items, 5, async (item) => {
    try {
      const body = await fetchArticleBody(item.url, source.body);
      if (body.length < 80) return null;
      return { item, body, grade: gradeArticle(annotate(item.title), annotateBody(body), levelOf) };
    } catch {
      return null;
    }
  });
  const ok = rows.filter((r) => r?.grade.ok).length;
  console.log(`\n## ${source.id} (${ok}/${rows.filter(Boolean).length} pass)`);
  for (const r of rows) {
    if (!r) continue;
    const g = r.grade;
    console.log(
      `${g.ok ? "PASS" : "skip"} ease ${String(g.ease).padStart(3)}  cov ${(g.coverage * 100).toFixed(0)}%` +
        `  foreign ${String(g.foreign).padStart(4)}  formal ${String(g.formal).padStart(4)}` +
        `  ${r.body.length}ch  ${r.item.title.slice(0, 34)}  ${g.reasons.join(",")}`,
    );
  }
}
