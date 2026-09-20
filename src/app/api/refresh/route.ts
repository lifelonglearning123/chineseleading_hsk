import { NextResponse } from "next/server";
import { sql, dbErrorMessage } from "@/lib/db";
import {
  SOURCES,
  fetchFeed,
  fetchArticleBody,
  sourceById,
  bodyKindFor,
  mapLimit,
} from "@/lib/feeds";
import { annotateBody } from "@/lib/dict";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** How many new articles to fully download per source on one refresh. */
const BODIES_PER_SOURCE = 4;

async function refresh(sourceIds: string[]): Promise<{
  added: number;
  bodies: number;
  errors: string[];
}> {
  const client = await sql();
  const errors: string[] = [];
  let added = 0;
  let bodies = 0;

  const sources = sourceIds.flatMap((id) => {
    const source = sourceById(id);
    return source ? [source] : [];
  });

  // Listings first, in parallel. Thirteen sequential fetches would eat most of
  // the function's time budget on their own.
  const listings = await mapLimit(sources, 6, async (source) => {
    try {
      return { source, items: await fetchFeed(source) };
    } catch (err) {
      errors.push(`${source.id}: ${(err as Error).message}`);
      return { source, items: [] };
    }
  });

  const pending: { id: number; url: string; sourceId: string }[] = [];

  for (const { source, items } of listings) {
    let fresh = 0;
    for (const item of items) {
      const rows = (await client(
        `insert into articles (url, title, summary, source, published_at)
         values ($1, $2, $3, $4, $5)
         on conflict (url) do nothing
         returning id, url`,
        [item.url, item.title, item.summary, item.source, item.publishedAt],
      )) as { id: number; url: string }[];
      if (!rows.length) continue;
      added += 1;
      if (fresh < BODIES_PER_SOURCE) {
        pending.push({ id: rows[0].id, url: rows[0].url, sourceId: source.id });
        fresh += 1;
      }
    }
  }

  // Download the readable body for the newest few, so the reader opens fast.
  const fetched = await mapLimit(pending, 5, async (row) => {
    try {
      const body = await fetchArticleBody(row.url, bodyKindFor(row.sourceId));
      if (!body || body.length < 80) return null;
      return { row, body };
    } catch (err) {
      errors.push(`body ${row.url}: ${(err as Error).message}`);
      return null;
    }
  });

  for (const hit of fetched) {
    if (!hit) continue;
    const { row, body } = hit;
    const tokens = annotateBody(body);
    const charCount = body.replace(/\s/g, "").length;
    const hardCount = new Set(
      tokens.flat().filter((t) => t.z && (t.l ?? 7) > 4).map((t) => t.t),
    ).size;
    // NetEase listings carry keywords rather than a standfirst, so fall back
    // to the opening line once the body is in hand.
    const lead = body.split("\n")[0]?.slice(0, 220) ?? "";
    await client(
      `update articles
          set body = $2, tokens = $3, char_count = $4, hard_count = $5,
              summary = case
                          when summary is null or summary = '' then $6
                          else summary
                        end
        where id = $1`,
      [row.id, body, JSON.stringify(tokens), charCount, hardCount, lead],
    );
    bodies += 1;
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
