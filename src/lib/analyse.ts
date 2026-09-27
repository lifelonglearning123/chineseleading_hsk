import { annotate, annotateBody, levelOf, type Token } from "@/lib/dict";
import { gradeArticle, type Grade } from "@/lib/grade";

export interface Analysis {
  tokens: Token[][];
  charCount: number;
  hardCount: number;
  grade: Grade;
}

/** Everything stored about an article once its text is in hand. */
export function analyse(title: string, body: string, tokens?: Token[][]): Analysis {
  const paragraphs = tokens ?? annotateBody(body);
  return {
    tokens: paragraphs,
    charCount: body.replace(/\s/g, "").length,
    hardCount: new Set(
      paragraphs.flat().filter((t) => t.z && (t.l ?? 7) > 4).map((t) => t.t),
    ).size,
    grade: gradeArticle(annotate(title), paragraphs, levelOf),
  };
}
