import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { lookup } from "@/lib/dict";
import { explainWord } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Deep explanation for one word. Cached in Postgres by word, because the
 * explanation is about the word itself rather than the passage it came from.
 */
export async function POST(request: Request) {
  let word = "";
  let context = "";
  let refresh = false;
  try {
    const body = (await request.json()) as {
      word?: string;
      context?: string;
      refresh?: boolean;
    };
    word = (body.word ?? "").trim();
    context = (body.context ?? "").trim();
    refresh = Boolean(body.refresh);
  } catch {
    return NextResponse.json({ error: "bad request body" }, { status: 400 });
  }

  if (!word) {
    return NextResponse.json({ error: "missing word" }, { status: 400 });
  }

  try {
    const client = await sql();

    if (!refresh) {
      const cached = (await client(
        `select payload from explanations where word = $1`,
        [word],
      )) as { payload: unknown }[];
      if (cached.length) {
        return NextResponse.json({ explanation: cached[0].payload, cached: true });
      }
    }

    const explanation = await explainWord(word, context, lookup(word));

    await client(
      `insert into explanations (word, payload) values ($1, $2)
       on conflict (word) do update set payload = excluded.payload,
                                        created_at = now()`,
      [word, JSON.stringify(explanation)],
    );

    return NextResponse.json({ explanation, cached: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
