import { NextResponse } from "next/server";
import { sql, dbErrorMessage } from "@/lib/db";
import { SOURCES } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40), 100);

  try {
    const client = await sql();
    const rows = (await client(
      `select id, url, title, summary, source, published_at,
              char_count, hard_count, (body is not null) as has_body
         from articles
        where ($1::text is null or source = $1)
        order by published_at desc nulls last, id desc
        limit $2`,
      [source, limit],
    )) as Record<string, unknown>[];

    return NextResponse.json({ articles: rows, sources: SOURCES });
  } catch (err) {
    return NextResponse.json(
      { error: dbErrorMessage(err), articles: [], sources: SOURCES },
      { status: 500 },
    );
  }
}
