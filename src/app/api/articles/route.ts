import { NextResponse } from "next/server";
import { sql, dbErrorMessage } from "@/lib/db";
import { SOURCES } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The article list. By default only articles graded as readable at HSK 4
 * (see lib/grade.ts); `?skipped=1` lists the ones the grader turned away,
 * so nothing is silently lost. Within each day, easiest first.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const skipped = url.searchParams.get("skipped") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40), 100);
  // Rows from sources since retired stay in the table but not in the list.
  const sourceIds = SOURCES.map((s) => s.id);

  try {
    const client = await sql();
    const rows = (await client(
      `select id, url, title, summary, source, published_at,
              char_count, hard_count, ease, grade, (body is not null) as has_body
         from articles
        where ($1::text is null or source = $1)
          and source = any($3::text[])
          and readable = $4
        order by (published_at at time zone 'Asia/Shanghai')::date desc nulls last,
                 ease desc, published_at desc, id desc
        limit $2`,
      [source, limit, sourceIds, !skipped],
    )) as Record<string, unknown>[];

    const counts = (await client(
      `select count(*)::int as n
         from articles
        where ($1::text is null or source = $1)
          and source = any($2::text[])
          and readable = $3`,
      [source, sourceIds, skipped],
    )) as { n: number }[];

    return NextResponse.json({
      articles: rows,
      sources: SOURCES,
      // Size of the other list: skipped articles when showing readable ones,
      // and the other way round.
      otherCount: counts[0]?.n ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: dbErrorMessage(err), articles: [], sources: SOURCES },
      { status: 500 },
    );
  }
}
