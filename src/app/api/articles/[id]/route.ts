import { NextResponse } from "next/server";
import { sql, dbErrorMessage } from "@/lib/db";
import { annotateBody, vocabulary, type Token } from "@/lib/dict";
import { analyse } from "@/lib/analyse";
import { fetchArticleBody, bodyKindFor } from "@/lib/feeds";

export const runtime = "nodejs";
export const maxDuration = 45;
export const dynamic = "force-dynamic";

interface Row {
  id: number;
  url: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string | null;
  body: string | null;
  tokens: Token[][] | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const articleId = Number(id);
  if (!Number.isFinite(articleId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  try {
    const client = await sql();
    const rows = (await client(
      `select id, url, title, summary, source, published_at, body, tokens
         from articles where id = $1`,
      [articleId],
    )) as Row[];

    if (!rows.length) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const row = rows[0];

    // The refresh job only downloads the newest few bodies per source, so an
    // older article may need fetching the first time it is opened.
    let body = row.body;
    let tokens = row.tokens;

    if (!body) {
      body = await fetchArticleBody(row.url, bodyKindFor(row.source));
      if (!body || body.length < 80) {
        return NextResponse.json(
          { error: "Could not read the article text from the publisher." },
          { status: 502 },
        );
      }
      tokens = null;
    }

    if (!tokens) {
      const analysis = analyse(row.title, body);
      tokens = analysis.tokens;
      await client(
        `update articles
            set body = $2, tokens = $3, char_count = $4, hard_count = $5,
                grade = $6, ease = $7, readable = $8
          where id = $1`,
        [
          articleId,
          body,
          JSON.stringify(tokens),
          analysis.charCount,
          analysis.hardCount,
          JSON.stringify(analysis.grade),
          analysis.grade.ease,
          analysis.grade.ok,
        ],
      );
    }

    const titleTokens = annotateBody(row.title)[0] ?? [];

    // Words already saved or already marked known, so the reader can style them.
    const saved = (await client(
      `select word from saved_words`,
    )) as { word: string }[];
    const known = (await client(
      `select word from known_words`,
    )) as { word: string }[];

    return NextResponse.json({
      article: {
        id: row.id,
        url: row.url,
        title: row.title,
        source: row.source,
        publishedAt: row.published_at,
      },
      titleTokens,
      paragraphs: tokens,
      vocabulary: vocabulary(tokens).slice(0, 40),
      saved: saved.map((r) => r.word),
      known: known.map((r) => r.word),
    });
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 500 });
  }
}
