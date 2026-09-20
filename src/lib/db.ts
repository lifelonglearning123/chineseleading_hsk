import { neon } from "@neondatabase/serverless";

/**
 * Neon Postgres access. Single-user app, so there is no tenant column.
 *
 * DATABASE_URL is injected by Vercel when a Neon store is attached to the
 * project; copy the same value into .env.local for local development.
 */

let client: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Attach a Neon Postgres store in the Vercel " +
          "dashboard (Storage tab), or add the connection string to .env.local.",
      );
    }
    client = neon(url);
  }
  return client;
}

/**
 * Create the tables if they are missing. Every statement is idempotent, and
 * the promise is memoised so a warm instance runs this once.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const conn = db();
      const statements = SCHEMA.split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await conn(statement);
      }
    })().catch((err) => {
      // Let the next request retry rather than caching the failure forever.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/** Convenience wrapper: ensure the schema exists, then hand back the client. */
export async function sql() {
  await ensureSchema();
  return db();
}

export const SCHEMA = `
create table if not exists articles (
  id            serial primary key,
  url           text unique not null,
  title         text not null,
  summary       text,
  source        text not null,
  published_at  timestamptz,
  body          text,
  tokens        jsonb,
  simplified    jsonb,
  char_count    int,
  hard_count    int,
  fetched_at    timestamptz not null default now()
);

create index if not exists articles_published_idx on articles (published_at desc nulls last);
create index if not exists articles_source_idx on articles (source);

create table if not exists saved_words (
  word           text primary key,
  pinyin         text,
  gloss          text,
  level          int,
  context        text,
  article_id     int references articles (id) on delete set null,
  created_at     timestamptz not null default now(),
  review_count   int not null default 0,
  last_reviewed  timestamptz
);

create index if not exists saved_words_created_idx on saved_words (created_at desc);

create table if not exists known_words (
  word        text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists explanations (
  word        text primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists settings (
  key    text primary key,
  value  jsonb not null
);
`;

export interface ArticleRow {
  id: number;
  url: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string | null;
  body: string | null;
  char_count: number | null;
  hard_count: number | null;
}
