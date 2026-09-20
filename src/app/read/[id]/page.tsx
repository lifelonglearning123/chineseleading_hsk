import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Reader, { type ReaderData } from "@/components/Reader";

export const dynamic = "force-dynamic";

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3280";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetch(`${await baseUrl()}/api/articles/${id}`, {
    cache: "no-store",
  });

  if (res.status === 404) notFound();

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return (
      <div className="card" style={{ padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
          Could not open this article
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.9375rem", margin: "0 0 1rem" }}>
          {json.error ?? "The publisher did not return readable text."}
        </p>
        <Link href="/" className="btn">
          Back to the list
        </Link>
      </div>
    );
  }

  const data = (await res.json()) as ReaderData;

  return (
    <>
      <Link
        href="/"
        style={{
          fontSize: "0.875rem",
          color: "var(--ink-faint)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: "1rem",
        }}
      >
        ← All news
      </Link>
      <Reader data={data} />
    </>
  );
}
