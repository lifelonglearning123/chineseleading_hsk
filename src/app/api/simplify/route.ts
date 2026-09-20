import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { annotateBody, type Token } from "@/lib/dict";
import { simplifyArticle } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 90;

interface Row {
  id: number;
  title: string;
  body: string | null;
  simplified: { level: number; titleTokens: Token[]; paragraphs: Token[][]; englishSummary: string } | null;
}

/**
 * Rewrite an article at HSK level N, the way a graded reader does, and return
 * it annotated exactly like the original so the reader renders it identically.
 * Cached on the article row.
 */
export async function POST(request: Request) {
  let articleId = 0;
  let level = 4;
  try {
    const body = (await request.json()) as { articleId?: number; level?: number };
    articleId = Number(body.articleId);
    level = Math.min(Math.max(Number(body.level ?? 4), 1), 6);
  } catch {
    return NextResponse.json({ error: "bad request body" }, { status: 400 });
  }

  if (!Number.isFinite(articleId)) {
    return NextResponse.json({ error: "missing articleId" }, { status: 400 });
  }

  try {
    const client = await sql();
    const rows = (await client(
      `select id, title, body, simplified from articles where id = $1`,
      [articleId],
    )) as Row[];

    if (!rows.length) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const row = rows[0];

    if (row.simplified && row.simplified.level === level) {
      return NextResponse.json({ ...row.simplified, cached: true });
    }
    if (!row.body) {
      return NextResponse.json(
        { error: "Open the article first so its text can be downloaded." },
        { status: 409 },
      );
    }

    const result = await simplifyArticle(row.title, row.body, level);
    const payload = {
      level,
      titleTokens: annotateBody(result.title)[0] ?? [],
      paragraphs: result.paragraphs
        .filter((p) => p.trim())
        .map((p) => annotateBody(p)[0] ?? []),
      englishSummary: result.englishSummary,
    };

    await client(`update articles set simplified = $2 where id = $1`, [
      articleId,
      JSON.stringify(payload),
    ]);

    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
