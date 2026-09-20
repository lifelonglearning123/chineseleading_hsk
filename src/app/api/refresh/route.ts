import { NextResponse } from "next/server";
import { sql, dbErrorMessage } from "@/lib/db";
import { SOURCES, fetchFeed, fetchArticleBody, sourceById } from "@/lib/feeds";
import { annotateBody } from "@/lib/dict";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** How many new articles to fully download per source on one refresh. */
const BODIES_PER_SOURCE = 6;

async function refresh(sourceIds: string[]): Promise<{
  added: number;
  bodies: number;
  errors: string[];
}> {
  const client = await sql();
  const errors: string[] = [];
  let added = 0;
  let bodies = 0;

  for (const id of sourceIds) {
    const source = sourceById(id);
    if (!source) continue;

    let items;
    try {
      items = await fetchFeed(source);
    } catch (err) {
      errors.push(`${source.id}: ${(err as Error).message}`);
      continue;
    }

    const fresh: { id: number; url: string }[] = [];
    for (const item of items) {
      const rows = (await client(
        `insert into articles (url, title, summary, source, published_at)
         values ($1, $2, $3, $4, $5)
         on conflict (url) do nothing
         returning id, url`,
        [item.url, item.title, item.summary, item.source, item.publishedAt],
      )) as { id: number; url: string }[];
      if (rows.length) {
        added += 1;
        fresh.push(rows[0]);
      }
    }

    // Download the readable body for the newest few, so the reader opens fast.
    for (const row of fresh.slice(0, BODIES_PER_SOURCE)) {
      try {
        const body = await fetchArticleBody(row.url);
        if (!body || body.length < 80) continue;
        const tokens = annotateBody(body);
        const charCount = body.replace(/\s/g, "").length;
        const hardCount = new Set(
          tokens.flat().filter((t) => t.z && (t.l ?? 7) > 4).map((t) => t.t),
        ).size;
        await client(
          `update articles
             set body = $2, tokens = $3, char_count = $4, hard_count = $5
           where id = $1`,
          [row.id, body, JSON.stringify(tokens), charCount, hardCount],
        );
        bodies += 1;
      } catch (err) {
        errors.push(`body ${row.url}: ${(err as Error).message}`);
      }
    }
  }

  return { added, bodies, errors };
}

/** Vercel Cron hits this with the CRON_SECRET bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await refresh(SOURCES.map((s) => s.id));
  return NextResponse.json(result);
}

/** Manual refresh from the UI. */
export async function POST(request: Request) {
  let sourceIds = SOURCES.map((s) => s.id);
  try {
    const body = (await request.json()) as { sources?: string[] };
    if (Array.isArray(body.sources) && body.sources.length) {
      sourceIds = body.sources;
    }
  } catch {
    // No body: refresh everything.
  }

  try {
    const result = await refresh(sourceIds);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 500 });
  }
}
