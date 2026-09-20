"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WordSheet from "./WordSheet";
import type { Token } from "@/lib/dict";

export interface ArticleMeta {
  id: number;
  url: string;
  title: string;
  source: string;
  publishedAt: string | null;
}

export interface ReaderData {
  article: ArticleMeta;
  titleTokens: Token[];
  paragraphs: Token[][];
  vocabulary: { word: string; pinyin: string; defs: string[]; level: number }[];
  saved: string[];
  known: string[];
}

interface Selection {
  token: Token;
  context: string;
}

const SETTINGS_KEY = "reader-settings-v1";

interface Settings {
  /** Show pinyin above words at this HSK level or harder. 8 = never, 0 = always. */
  pinyinAbove: number;
  fontScale: number;
}

const DEFAULT_SETTINGS: Settings = { pinyinAbove: 5, fontScale: 1 };

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Rebuild the sentence a token sits in, for context in the explanation. */
function sentenceAround(tokens: Token[], index: number): string {
  const isBreak = (t: string) => /[。！？；\n]/.test(t);
  let start = index;
  while (start > 0 && !isBreak(tokens[start - 1].t)) start -= 1;
  let end = index;
  while (end < tokens.length - 1 && !isBreak(tokens[end].t)) end += 1;
  return tokens
    .slice(start, end + 1)
    .map((t) => t.t)
    .join("")
    .trim();
}

export default function Reader({ data }: { data: ReaderData }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set(data.saved));
  const [known, setKnown] = useState<Set<string>>(new Set(data.known));
  const [simplified, setSimplified] = useState<{
    titleTokens: Token[];
    paragraphs: Token[][];
    englishSummary: string;
  } | null>(null);
  const [showSimple, setShowSimple] = useState(false);
  const [simplifying, setSimplifying] = useState(false);
  const [simplifyError, setSimplifyError] = useState<string | null>(null);

  useEffect(() => setSettings(loadSettings()), []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Private browsing: settings just will not persist.
      }
      return next;
    });
  }, []);

  const needsPinyin = useCallback(
    (tok: Token) => {
      if (!tok.z || !tok.p) return false;
      if (known.has(tok.t)) return false;
      return (tok.l ?? 7) >= settings.pinyinAbove;
    },
    [known, settings.pinyinAbove],
  );

  const onSave = useCallback(
    async (word: string, context: string) => {
      setSaved((prev) => new Set(prev).add(word));
      await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, context, articleId: data.article.id }),
      }).catch(() => undefined);
    },
    [data.article.id],
  );

  const onUnsave = useCallback(async (word: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      next.delete(word);
      return next;
    });
    await fetch(`/api/words?word=${encodeURIComponent(word)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }, []);

  const onToggleKnown = useCallback(
    async (word: string) => {
      const isKnown = known.has(word);
      setKnown((prev) => {
        const next = new Set(prev);
        if (isKnown) next.delete(word);
        else next.add(word);
        return next;
      });
      if (isKnown) {
        await fetch(`/api/known?word=${encodeURIComponent(word)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      } else {
        await fetch("/api/known", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word }),
        }).catch(() => undefined);
      }
    },
    [known],
  );

  const loadSimplified = useCallback(async () => {
    if (simplified) {
      setShowSimple(true);
      return;
    }
    setSimplifying(true);
    setSimplifyError(null);
    try {
      const res = await fetch("/api/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: data.article.id, level: 4 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not simplify this article.");
      setSimplified(json);
      setShowSimple(true);
    } catch (err) {
      setSimplifyError((err as Error).message);
    } finally {
      setSimplifying(false);
    }
  }, [data.article.id, simplified]);

  const shown = showSimple && simplified ? simplified.paragraphs : data.paragraphs;
  const shownTitle =
    showSimple && simplified ? simplified.titleTokens : data.titleTokens;

  const stats = useMemo(() => {
    const words = data.paragraphs.flat().filter((t) => t.z);
    const hard = new Set(words.filter((t) => (t.l ?? 7) > 4).map((t) => t.t));
    const chars = data.paragraphs
      .flat()
      .reduce((n, t) => n + (t.z ? t.t.length : 0), 0);
    return { chars, hard: hard.size };
  }, [data.paragraphs]);

  const renderTokens = (tokens: Token[], keyPrefix: string) =>
    tokens.map((tok, i) => {
      if (!tok.z) {
        return (
          <span key={`${keyPrefix}-${i}`} className="tok tok-plain">
            {tok.t}
          </span>
        );
      }
      const classes = ["tok"];
      if (saved.has(tok.t)) classes.push("tok-saved");
      if ((tok.l ?? 7) > 4 && !known.has(tok.t)) classes.push("tok-hard");
      if (selection?.token.t === tok.t) classes.push("tok-active");

      return (
        <span
          key={`${keyPrefix}-${i}`}
          className={classes.join(" ")}
          role="button"
          tabIndex={0}
          onClick={() =>
            setSelection({ token: tok, context: sentenceAround(tokens, i) })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelection({ token: tok, context: sentenceAround(tokens, i) });
            }
          }}
        >
          {needsPinyin(tok) ? (
            <ruby>
              {tok.t}
              <rt>{tok.p}</rt>
            </ruby>
          ) : (
            tok.t
          )}
        </span>
      );
    });

  return (
    <>
      <article>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
            fontSize: "0.8125rem",
            color: "var(--ink-faint)",
          }}
        >
          <span>{data.article.publishedAt?.slice(0, 10) ?? ""}</span>
          <span>·</span>
          <span>{stats.chars} characters</span>
          <span>·</span>
          <span>{stats.hard} words above HSK 4</span>
        </div>

        <h1
          className="han reading"
          style={{
            fontSize: "calc(var(--reading-size) * 1.25)",
            fontWeight: 700,
            margin: "0 0 1.25rem",
            lineHeight: 2.1,
          }}
        >
          {renderTokens(shownTitle, "title")}
        </h1>

        <div
          className="card"
          style={{
            padding: "0.75rem",
            marginBottom: "1.5rem",
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label
            style={{
              fontSize: "0.8125rem",
              color: "var(--ink-soft)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            Pinyin above
            <select
              className="chip"
              value={settings.pinyinAbove}
              onChange={(e) => update({ pinyinAbove: Number(e.target.value) })}
              style={{ appearance: "auto", padding: "0.3rem 0.5rem" }}
            >
              <option value={0}>every word</option>
              <option value={3}>HSK 3+</option>
              <option value={4}>HSK 4+</option>
              <option value={5}>HSK 5+ (above my level)</option>
              <option value={6}>HSK 6+</option>
              <option value={7}>unlisted words only</option>
              <option value={8}>never</option>
            </select>
          </label>

          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            {simplified || !simplifying ? (
              <button
                className={`chip ${showSimple ? "chip-on" : ""}`}
                onClick={() => (showSimple ? setShowSimple(false) : loadSimplified())}
                disabled={simplifying}
              >
                {showSimple ? "Original" : "Rewrite at HSK 4"}
              </button>
            ) : (
              <span className="chip" style={{ cursor: "default" }}>
                <span className="spin" /> Rewriting
              </span>
            )}
            <a
              className="chip"
              href={data.article.url}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              Source
            </a>
          </div>
        </div>

        {simplifyError && (
          <p
            style={{
              color: "var(--saved)",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {simplifyError}
          </p>
        )}

        {showSimple && simplified?.englishSummary && (
          <div
            className="card rise"
            style={{
              padding: "0.9rem 1rem",
              marginBottom: "1.5rem",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "var(--ink-soft)",
            }}
          >
            <strong style={{ color: "var(--ink)" }}>In English: </strong>
            {simplified.englishSummary}
          </div>
        )}

        <div className="han reading">
          {shown.map((para, i) => (
            <p key={i} style={{ margin: "0 0 1.4rem" }}>
              {renderTokens(para, `p${i}`)}
            </p>
          ))}
        </div>

        {data.vocabulary.length > 0 && (
          <section style={{ marginTop: "2.5rem" }}>
            <h2
              style={{
                fontSize: "0.9375rem",
                fontWeight: 600,
                marginBottom: "0.75rem",
                color: "var(--ink-soft)",
              }}
            >
              Harder words in this article
            </h2>
            <div className="card" style={{ overflow: "hidden" }}>
              {data.vocabulary.map((v, i) => (
                <button
                  key={v.word}
                  onClick={() =>
                    setSelection({
                      token: {
                        t: v.word,
                        p: v.pinyin,
                        g: v.defs,
                        l: v.level,
                        z: true,
                      },
                      context: "",
                    })
                  }
                  style={{
                    display: "flex",
                    width: "100%",
                    gap: "0.75rem",
                    alignItems: "baseline",
                    padding: "0.6rem 0.9rem",
                    background: "none",
                    border: "none",
                    borderTop: i ? "1px solid var(--rule)" : "none",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--ink)",
                  }}
                >
                  <span
                    className="han"
                    style={{ fontSize: "1.125rem", fontWeight: 600, minWidth: "4.5rem" }}
                  >
                    {v.word}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--ink-faint)", minWidth: "5rem" }}>
                    {v.pinyin}
                  </span>
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--ink-soft)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {v.defs[0]}
                  </span>
                  {saved.has(v.word) && (
                    <span className="level-pill" style={{ background: "var(--saved-soft)", color: "var(--saved)" }}>
                      saved
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </article>

      {selection && (
        <WordSheet
          word={selection.token.t}
          context={selection.context}
          fallbackPinyin={selection.token.p}
          fallbackDefs={selection.token.g}
          fallbackLevel={selection.token.l}
          isSaved={saved.has(selection.token.t)}
          isKnown={known.has(selection.token.t)}
          onSave={() => onSave(selection.token.t, selection.context)}
          onUnsave={() => onUnsave(selection.token.t)}
          onToggleKnown={() => onToggleKnown(selection.token.t)}
          onClose={() => setSelection(null)}
        />
      )}
    </>
  );
}
