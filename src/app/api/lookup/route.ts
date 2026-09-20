import { NextResponse } from "next/server";
import { lookup, characters, levelOf } from "@/lib/dict";

export const runtime = "nodejs";

/** Instant offline lookup: dictionary gloss, pinyin and character breakdown. */
export async function GET(request: Request) {
  const word = new URL(request.url).searchParams.get("w")?.trim();
  if (!word) {
    return NextResponse.json({ error: "missing ?w=" }, { status: 400 });
  }

  const entry = lookup(word);
  return NextResponse.json({
    word,
    pinyin: entry?.pinyin ?? "",
    defs: entry?.defs ?? [],
    level: entry?.level ?? levelOf(word),
    characters: characters(word),
    found: Boolean(entry),
  });
}
