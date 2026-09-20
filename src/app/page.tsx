"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Article {
  id: number;
  url: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string | null;
  char_count: number | null;
  hard_count: number | null;
  has_body: boolean;
}

interface Source {
  id: string;
  label: string;
  labelZh: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function HomePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (source: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = source ? `?source=${encodeURIComponent(source)}` : "";
      const res = await fetch(`/api/articles${qs}`);
      const json = await res.json();
      if (json.sources) setSources(json.sources);
      setArticles(json.articles ?? []);
      if (json.error) setError(json.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(active);
  }, [active, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const json = await res.json();
      if (json.error) setError(json.error);
      await load(active);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [active, load]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Today&apos;s news</h1>
        <span style={{ fontSize: "0.8125rem", color: "var(--ink-faint)" }}>
          中国新闻网 · China News Service
        </span>
        <button
          className="chip"
          onClick={refresh}
          disabled={refreshing}
          style={{ marginLeft: "auto" }}
        >
          {refreshing ? (
            <>
              <span className="spin" /> Fetching
            </>
          ) : (
            "Fetch latest"
          )}
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", overflowX: "auto", paddingBottom: "0.75rem", marginBottom: "0.5rem" }}>
        <button
          className={`chip ${active === null ? "chip-on" : ""}`}
          onClick={() => setActive(null)}
        >
          All
        </button>
        {sources.map((s) => (
          <button
            key={s.id}
            className={`chip ${active === s.id ? "chip-on" : ""}`}
            onClick={() => setActive(s.id)}
          >
            <span className="han">{s.labelZh}</span>
            <span style={{ opacity: 0.7 }}>{s.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div
          className="card"
          style={{ padding: "1.1rem", marginBottom: "1rem", borderColor: "var(--saved)" }}
        >
          <strong style={{ display: "block", marginBottom: "0.4rem" }}>
            {/setupNeeded|No database connected/i.test(error)
              ? "One step left: connect a database"
              : "Something went wrong"}
          </strong>
          <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
            {error}
          </span>
          {/No database connected|Could not reach the database/i.test(error) && (
            <ol
              style={{
                fontSize: "0.875rem",
                color: "var(--ink-soft)",
                lineHeight: 1.7,
                margin: "0.85rem 0 0",
                paddingLeft: "1.2rem",
              }}
            >
              <li>
                Sign in at <strong>neon.tech</strong> and create a project, or open your
                Vercel project and add a Neon store under Storage.
              </li>
              <li>Copy the connection string it gives you.</li>
              <li>
                Paste it into <strong>.env.local</strong> as <code>DATABASE_URL</code>,
                replacing the example value.
              </li>
              <li>Stop the dev server and start it again.</li>
            </ol>
          )}
        </div>
      )}

      {loading && articles.length === 0 && (
        <p style={{ color: "var(--ink-faint)" }}>Loading…</p>
      )}

      {!loading && articles.length === 0 && !error && (
        <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.85rem", color: "var(--ink-soft)" }}>
            No articles yet. Pull today&apos;s headlines to get started.
          </p>
          <button className="btn btn-primary" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Fetching…" : "Fetch latest news"}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {articles.map((a) => (
          <Link
            key={a.id}
            href={`/read/${a.id}`}
            className="card"
            style={{
              display: "block",
              padding: "1rem 1.1rem",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                fontSize: "0.75rem",
                color: "var(--ink-faint)",
                marginBottom: "0.5rem",
              }}
            >
              <span className="level-pill">
                {sources.find((s) => s.id === a.source)?.labelZh ?? a.source}
              </span>
              <span>{timeAgo(a.published_at)}</span>
              {a.char_count ? (
                <>
                  <span>·</span>
                  <span>{a.char_count} chars</span>
                </>
              ) : null}
              {a.hard_count ? (
                <>
                  <span>·</span>
                  <span>{a.hard_count} above HSK 4</span>
                </>
              ) : null}
            </div>
            <h2
              className="han"
              style={{ fontSize: "1.1875rem", fontWeight: 600, margin: 0, lineHeight: 1.7 }}
            >
              {a.title}
            </h2>
            {a.summary && (
              <p
                className="han"
                style={{
                  margin: "0.5rem 0 0",
                  fontSize: "0.9375rem",
                  lineHeight: 1.8,
                  color: "var(--ink-soft)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {a.summary}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
