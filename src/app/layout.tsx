import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "读报 · Chinese News Reader",
  description:
    "Read today's Chinese news with tap-to-translate, automatic pinyin above unfamiliar words, and a saved vocabulary list.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: "1px solid var(--rule)",
            background: "var(--paper-raised)",
            position: "sticky",
            top: 0,
            zIndex: 40,
          }}
        >
          <div
            style={{
              maxWidth: 780,
              margin: "0 auto",
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <Link
              href="/"
              style={{
                textDecoration: "none",
                color: "var(--ink)",
                display: "flex",
                alignItems: "baseline",
                gap: "0.5rem",
              }}
            >
              <span
                className="han"
                style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "0.02em" }}
              >
                读报
              </span>
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--ink-faint)",
                  letterSpacing: "0.02em",
                }}
              >
                News Reader
              </span>
            </Link>
            <nav style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
              <Link href="/" className="chip" style={{ textDecoration: "none" }}>
                Today
              </Link>
              <Link href="/words" className="chip" style={{ textDecoration: "none" }}>
                My words
              </Link>
            </nav>
          </div>
        </header>
        <main style={{ maxWidth: 780, margin: "0 auto", padding: "1.25rem 1rem 5rem" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
