import { NextResponse } from "next/server";
import { sql, dbErrorMessage } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Words the reader has told us they already know. These never get automatic
 * pinyin, whatever their HSK level, so the display adapts to real vocabulary
 * rather than to the syllabus.
 */
export async function GET() {
  try {
    const client = await sql();
    const rows = (await client(
      `select word from known_words order by created_at desc`,
    )) as { word: string }[];
    return NextResponse.json({ words: rows.map((r) => r.word) });
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err), words: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { word } = (await request.json()) as { word?: string };
  if (!word) return NextResponse.json({ error: "missing word" }, { status: 400 });

  const client = await sql();
  await client(
    `insert into known_words (word) values ($1) on conflict do nothing`,
    [word],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const word = new URL(request.url).searchParams.get("word");
  if (!word) return NextResponse.json({ error: "missing word" }, { status: 400 });

  const client = await sql();
  await client(`delete from known_words where word = $1`, [word]);
  return NextResponse.json({ ok: true });
}
