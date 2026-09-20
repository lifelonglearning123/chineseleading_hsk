import { NextResponse } from "next/server";
import { sql, dbErrorMessage } from "@/lib/db";
import { lookup } from "@/lib/dict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface SavedWordRow {
  word: string;
  pinyin: string | null;
  gloss: string | null;
  level: number | null;
  context: string | null;
  article_id: number | null;
  created_at: string;
  review_count: number;
  last_reviewed: string | null;
  article_title?: string | null;
  explanation?: unknown;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const order = url.searchParams.get("order") ?? "recent";
  const orderBy =
    order === "level"
      ? "w.level desc nulls last, w.created_at desc"
      : order === "reviews"
        ? "w.review_count asc, w.created_at desc"
        : "w.created_at desc";

  try {
    const client = await sql();
    const rows = (await client(
      `select w.word, w.pinyin, w.gloss, w.level, w.context, w.article_id,
              w.created_at, w.review_count, w.last_reviewed,
              a.title as article_title,
              e.payload as explanation
         from saved_words w
         left join articles a on a.id = w.article_id
         left join explanations e on e.word = w.word
        order by ${orderBy}`,
    )) as SavedWordRow[];

    return NextResponse.json({ words: rows });
  } catch (err) {
    return NextResponse.json(
      { error: dbErrorMessage(err), words: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let word = "";
  let context = "";
  let articleId: number | null = null;
  try {
    const body = (await request.json()) as {
      word?: string;
      context?: string;
      articleId?: number | null;
    };
    word = (body.word ?? "").trim();
    context = (body.context ?? "").trim();
    articleId = body.articleId ?? null;
  } catch {
    return NextResponse.json({ error: "bad request body" }, { status: 400 });
  }

  if (!word) return NextResponse.json({ error: "missing word" }, { status: 400 });

  try {
    const entry = lookup(word);
    const client = await sql();
    await client(
      `insert into saved_words (word, pinyin, gloss, level, context, article_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (word) do update
         set context    = coalesce(saved_words.context, excluded.context),
             article_id = coalesce(saved_words.article_id, excluded.article_id)`,
      [
        word,
        entry?.pinyin ?? null,
        entry ? entry.defs.slice(0, 3).join("; ") : null,
        entry?.level ?? null,
        context || null,
        articleId,
      ],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 500 });
  }
}

/** Record a review pass over a saved word. */
export async function PATCH(request: Request) {
  const { word } = (await request.json()) as { word?: string };
  if (!word) return NextResponse.json({ error: "missing word" }, { status: 400 });

  const client = await sql();
  await client(
    `update saved_words
        set review_count = review_count + 1, last_reviewed = now()
      where word = $1`,
    [word],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const word = new URL(request.url).searchParams.get("word");
  if (!word) return NextResponse.json({ error: "missing word" }, { status: 400 });

  const client = await sql();
  await client(`delete from saved_words where word = $1`, [word]);
  return NextResponse.json({ ok: true });
}
