"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Explanation } from "@/lib/ai";

interface SavedWord {
  word: string;
  pinyin: string | null;
  gloss: string | null;
  level: number | null;
  context: string | null;
  article_id: number | null;
  article_title: string | null;
  created_at: string;
  review_count: number;
  last_reviewed: string | null;
  explanation: Explanation | null;
}

type Order = "recent" | "level" | "reviews";

export default function WordsPage() {
  const [words, setWords] = useState<SavedWord[]>([]);
  const [order, setOrder] = useState<Order>("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/words?order=${order}`);
      const json = await res.json();
      setWords(json.words ?? []);
      if (json.error) setError(json.error);
      else setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(async (word: string) => {
    setWords((prev) => prev.filter((w) => w.word !== word));
    await fetch(`/api/words?word=${encodeURIComponent(word)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }, []);

  const markReviewed = useCallback(async (word: string) => {
    await fetch("/api/words", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
    }).catch(() => undefined);
  }, []);

  const quizDeck = useMemo(
    () => [...words].sort((a, b) => a.review_count - b.review_count),
    [words],
  );
  const card = quizDeck[quizIndex];

  const nextCard = useCallback(
    (knewIt: boolean) => {
      if (card && knewIt) markReviewed(card.word);
      setRevealed(false);
      setQuizIndex((i) => (i + 1) % Math.max(quizDeck.length, 1));
    },
    [card, markReviewed, quizDeck.length],
  );

  if (quizMode && quizDeck.length > 0 && card) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Review</h1>
          <span style={{ marginLeft: "0.75rem", fontSize: "0.8125rem", color: "var(--ink-faint)" }}>
            {quizIndex + 1} / {quizDeck.length}
          </span>
          <button
            className="chip"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              setQuizMode(false);
              load();
            }}
          >
            Done
          </button>
        </div>

        <div
          className="card"
          style={{
            padding: "2.5rem 1.5rem",
            textAlign: "center",
            minHeight: 300,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "1rem",
          }}
        >
          <div className="han" style={{ fontSize: "3rem", fontWeight: 700, lineHeight: 1.3 }}>
            {card.word}
          </div>

          {revealed ? (
            <div className="rise">
              <div style={{ fontSize: "1.125rem", color: "var(--accent-ink)", marginBottom: "0.5rem" }}>
                {card.pinyin}
              </div>
              <div style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>{card.gloss}</div>
              {card.context && (
                <p
                  className="han"
                  style={{
                    marginTop: "1.25rem",
                    fontSize: "1rem",
                    lineHeight: 1.9,
                    color: "var(--ink-faint)",
                  }}
                >
                  {card.context}
                </p>
              )}
            </div>
          ) : (
            <button className="btn" onClick={() => setRevealed(true)}>
              Show pinyin and meaning
            </button>
          )}
        </div>

        {revealed && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => nextCard(false)}>
              Still learning
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => nextCard(true)}>
              I knew it
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>My words</h1>
        <span style={{ fontSize: "0.8125rem", color: "var(--ink-faint)" }}>
          {words.length} saved
        </span>
        {words.length > 0 && (
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              setQuizMode(true);
              setQuizIndex(0);
              setRevealed(false);
            }}
          >
            Review them
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {(
          [
            ["recent", "Newest first"],
            ["level", "Hardest first"],
            ["reviews", "Least reviewed"],
          ] as [Order, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`chip ${order === key ? "chip-on" : ""}`}
            onClick={() => setOrder(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--saved)" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{error}</span>
        </div>
      )}

      {loading && <p style={{ color: "var(--ink-faint)" }}>Loading…</p>}

      {!loading && words.length === 0 && !error && (
        <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.85rem", color: "var(--ink-soft)" }}>
            Nothing saved yet. Tap any word while reading and choose Save.
          </p>
          <Link href="/" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Go and read something
          </Link>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.6rem" }}>
        {words.map((w) => (
          <div key={w.word} className="card" style={{ padding: "0.9rem 1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", flexWrap: "wrap" }}>
              <button
                onClick={() => setOpen(open === w.word ? null : w.word)}
                className="han"
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                {w.word}
              </button>
              <span style={{ color: "var(--accent-ink)", fontSize: "0.9375rem" }}>{w.pinyin}</span>
              {w.level ? (
                <span className="level-pill">
                  {w.level >= 7 ? "beyond HSK 6" : `HSK ${w.level}`}
                </span>
              ) : null}
              {w.review_count > 0 && (
                <span style={{ fontSize: "0.75rem", color: "var(--ink-faint)" }}>
                  reviewed {w.review_count}×
                </span>
              )}
              <button
                className="chip"
                style={{ marginLeft: "auto" }}
                onClick={() => remove(w.word)}
              >
                Remove
              </button>
            </div>

            {w.gloss && (
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.9375rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
                {w.gloss}
              </p>
            )}

            {open === w.word && (
              <div className="rise" style={{ marginTop: "0.9rem", display: "grid", gap: "0.9rem" }}>
                {w.context && (
                  <div>
                    <div style={labelStyle}>Where you found it</div>
                    <p className="han" style={{ margin: 0, fontSize: "1rem", lineHeight: 1.9, color: "var(--ink-soft)" }}>
                      {w.context}
                    </p>
                    {w.article_id && w.article_title && (
                      <Link
                        href={`/read/${w.article_id}`}
                        className="han"
                        style={{ fontSize: "0.8125rem", color: "var(--accent-ink)" }}
                      >
                        {w.article_title}
                      </Link>
                    )}
                  </div>
                )}

                {w.explanation ? (
                  <SavedExplanation data={w.explanation} />
                ) : (
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ink-faint)" }}>
                    No full explanation stored yet. Open this word while reading and
                    tap Explain to generate one.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--ink-faint)",
  marginBottom: "0.3rem",
};

function SavedExplanation({ data }: { data: Explanation }) {
  return (
    <div style={{ display: "grid", gap: "0.9rem" }}>
      {data.meaning && (
        <div>
          <div style={labelStyle}>Meaning</div>
          <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.9375rem" }}>{data.meaning}</p>
        </div>
      )}

      {data.characters?.length > 0 && (
        <div>
          <div style={labelStyle}>Characters</div>
          {data.characters.map((c) => (
            <div key={c.char} style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--ink-soft)" }}>
              <span className="han" style={{ fontWeight: 600, color: "var(--ink)" }}>
                {c.char}
              </span>{" "}
              <span style={{ color: "var(--accent-ink)" }}>{c.pinyin}</span> — {c.meaning}
            </div>
          ))}
        </div>
      )}

      {data.collocations?.length > 0 && (
        <div>
          <div style={labelStyle}>Goes with</div>
          {data.collocations.map((c) => (
            <div key={c.word} style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--ink-soft)" }}>
              <span className="han" style={{ fontWeight: 600, color: "var(--ink)" }}>
                {c.word}
              </span>{" "}
              <span style={{ color: "var(--accent-ink)" }}>{c.pinyin}</span> — {c.meaning}
            </div>
          ))}
        </div>
      )}

      {data.examples?.length > 0 && (
        <div>
          <div style={labelStyle}>Examples</div>
          {data.examples.map((ex, i) => (
            <div key={i} style={{ marginBottom: "0.5rem" }}>
              <div className="han" style={{ fontSize: "1rem", lineHeight: 1.85 }}>
                {ex.zh}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--ink-faint)" }}>{ex.en}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
