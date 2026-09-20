"use client";

import { useCallback, useEffect, useState } from "react";
import type { Explanation } from "@/lib/ai";
import type { DictEntry } from "@/lib/dict";

interface LookupResult {
  word: string;
  pinyin: string;
  defs: string[];
  level: number;
  characters: DictEntry[];
  found: boolean;
}

interface Props {
  word: string;
  context: string;
  fallbackPinyin?: string;
  fallbackDefs?: string[];
  fallbackLevel?: number;
  isSaved: boolean;
  isKnown: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onToggleKnown: () => void;
  onClose: () => void;
}

function levelLabel(level?: number): string {
  if (!level) return "";
  return level >= 7 ? "beyond HSK 6" : `HSK ${level}`;
}

export default function WordSheet({
  word,
  context,
  fallbackPinyin,
  fallbackDefs,
  fallbackLevel,
  isSaved,
  isKnown,
  onSave,
  onUnsave,
  onToggleKnown,
  onClose,
}: Props) {
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLookup(null);
    setExplanation(null);
    setError(null);

    fetch(`/api/lookup?w=${encodeURIComponent(word)}`)
      .then((r) => r.json())
      .then((json: LookupResult) => {
        if (!cancelled) setLookup(json);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [word]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const explain = useCallback(async () => {
    setLoadingExplanation(true);
    setError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Explanation failed.");
      setExplanation(json.explanation as Explanation);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingExplanation(false);
    }
  }, [word, context]);

  const pinyin = lookup?.pinyin || fallbackPinyin || "";
  const defs = lookup?.defs?.length ? lookup.defs : (fallbackDefs ?? []);
  const level = lookup?.level ?? fallbackLevel;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 18, 15, 0.35)",
        zIndex: 60,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        className="rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper-raised)",
          borderTop: "1px solid var(--rule)",
          borderRadius: "18px 18px 0 0",
          width: "100%",
          maxWidth: 780,
          maxHeight: "82vh",
          overflowY: "auto",
          padding: "1rem 1.1rem 2rem",
          boxShadow: "var(--shadow)",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: "var(--rule)",
            margin: "0 auto 1rem",
          }}
        />

        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
          <span className="han" style={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1.2 }}>
            {word}
          </span>
          <span style={{ fontSize: "1.0625rem", color: "var(--accent-ink)", fontWeight: 500 }}>
            {pinyin}
          </span>
          {level && <span className="level-pill">{levelLabel(level)}</span>}
        </div>

        {defs.length > 0 ? (
          <ul style={{ margin: "0.85rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.65 }}>
            {defs.map((d, i) => (
              <li key={i} style={{ color: "var(--ink-soft)", fontSize: "0.9375rem" }}>
                {d}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--ink-faint)", fontSize: "0.9375rem", marginTop: "0.85rem" }}>
            No dictionary entry. This is usually a name or a very new term. Ask for a
            full explanation below.
          </p>
        )}

        {context && (
          <p
            className="han"
            style={{
              marginTop: "1rem",
              padding: "0.7rem 0.85rem",
              background: "var(--paper)",
              borderRadius: 10,
              border: "1px solid var(--rule)",
              fontSize: "1rem",
              lineHeight: 1.9,
              color: "var(--ink-soft)",
            }}
          >
            {context}
          </p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          {isSaved ? (
            <button className="btn" onClick={onUnsave}>
              Saved ✓ — remove
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onSave}>
              Save this word
            </button>
          )}
          <button className={`btn ${isKnown ? "btn-primary" : ""}`} onClick={onToggleKnown}>
            {isKnown ? "Marked as known" : "I know this one"}
          </button>
        </div>

        {/* Character breakdown comes straight from the dictionary, no API call. */}
        {lookup && lookup.characters.length > 1 && (
          <section style={{ marginTop: "1.5rem" }}>
            <h3 style={sectionHeading}>Characters</h3>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {lookup.characters.map((c) => (
                <div
                  key={c.word}
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "baseline",
                    padding: "0.5rem 0.7rem",
                    background: "var(--paper)",
                    border: "1px solid var(--rule)",
                    borderRadius: 10,
                  }}
                >
                  <span className="han" style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                    {c.word}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--accent-ink)", minWidth: "3.5rem" }}>
                    {c.pinyin}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                    {c.defs.slice(0, 3).join("; ")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!explanation && (
          <button
            className="btn"
            onClick={explain}
            disabled={loadingExplanation}
            style={{ marginTop: "1.5rem", width: "100%" }}
          >
            {loadingExplanation ? (
              <>
                <span className="spin" /> Thinking
              </>
            ) : (
              "Explain it properly — usage, collocations, examples"
            )}
          </button>
        )}

        {error && (
          <p style={{ color: "var(--saved)", fontSize: "0.875rem", marginTop: "0.85rem" }}>
            {error}
          </p>
        )}

        {explanation && <ExplanationView data={explanation} />}
      </div>
    </div>
  );
}

const sectionHeading: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--ink-faint)",
  margin: "0 0 0.6rem",
};

function ExplanationView({ data }: { data: Explanation }) {
  return (
    <div className="rise" style={{ marginTop: "1.75rem", display: "grid", gap: "1.6rem" }}>
      <section>
        <h3 style={sectionHeading}>Meaning</h3>
        <p style={{ margin: 0, lineHeight: 1.65 }}>{data.meaning}</p>
        {data.inContext && (
          <p style={{ margin: "0.5rem 0 0", lineHeight: 1.65, color: "var(--ink-soft)" }}>
            <strong>Here: </strong>
            {data.inContext}
          </p>
        )}
        <p style={{ margin: "0.6rem 0 0", fontSize: "0.8125rem", color: "var(--ink-faint)" }}>
          {[data.partOfSpeech, data.register].filter(Boolean).join(" · ")}
        </p>
      </section>

      {data.characters?.length > 0 && (
        <section>
          <h3 style={sectionHeading}>Character by character</h3>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {data.characters.map((c) => (
              <div key={c.char} style={{ lineHeight: 1.6 }}>
                <span className="han" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                  {c.char}
                </span>{" "}
                <span style={{ color: "var(--accent-ink)", fontSize: "0.875rem" }}>{c.pinyin}</span>
                <div style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{c.meaning}</div>
                {c.note && (
                  <div className="han" style={{ fontSize: "0.875rem", color: "var(--ink-faint)" }}>
                    {c.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.collocations?.length > 0 && (
        <section>
          <h3 style={sectionHeading}>Words it goes with</h3>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {data.collocations.map((c) => (
              <div key={c.word} style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="han" style={{ fontSize: "1.0625rem", fontWeight: 600, minWidth: "5rem" }}>
                  {c.word}
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--accent-ink)", minWidth: "5rem" }}>
                  {c.pinyin}
                </span>
                <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)", flex: 1 }}>{c.meaning}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.examples?.length > 0 && (
        <section>
          <h3 style={sectionHeading}>Examples</h3>
          <div style={{ display: "grid", gap: "0.9rem" }}>
            {data.examples.map((ex, i) => (
              <div key={i}>
                <div className="han" style={{ fontSize: "1.125rem", lineHeight: 1.85 }}>
                  {ex.zh}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--accent-ink)", lineHeight: 1.5 }}>
                  {ex.pinyin}
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                  {ex.en}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.confusedWith?.length > 0 && (
        <section>
          <h3 style={sectionHeading}>Don&apos;t mix it up with</h3>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {data.confusedWith.map((c) => (
              <div key={c.word} style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="han" style={{ fontSize: "1.0625rem", fontWeight: 600, minWidth: "5rem" }}>
                  {c.word}
                </span>
                <span style={{ fontSize: "0.8125rem", color: "var(--accent-ink)", minWidth: "5rem" }}>
                  {c.pinyin}
                </span>
                <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)", flex: 1 }}>{c.meaning}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.memoryHook && (
        <section>
          <h3 style={sectionHeading}>To remember it</h3>
          <p style={{ margin: 0, lineHeight: 1.65, color: "var(--ink-soft)" }}>{data.memoryHook}</p>
        </section>
      )}
    </div>
  );
}
