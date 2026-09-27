import { neon } from "@neondatabase/serverless";

/**
 * Neon Postgres access. Single-user app, so there is no tenant column.
 *
 * DATABASE_URL is injected by Vercel when a Neon store is attached to the
 * project; copy the same value into .env.local for local development.
 */

let client: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

/** Marker for the connection string shipped in .env.example. */
const PLACEHOLDER = "user:password@host";

export const SETUP_MESSAGE =
  "No database connected yet. Create a free Postgres database at neon.tech, " +
  "or in the Vercel dashboard under Storage, then put its connection string " +
  "in .env.local as DATABASE_URL and restart. The tables build themselves on " +
  "the first request.";

export function isConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && !url.includes(PLACEHOLDER));
}

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url || url.includes(PLACEHOLDER)) {
      throw new DatabaseSetupError(SETUP_MESSAGE);
    }
    client = neon(url);
  }
  return client;
}

/** Thrown when there is nothing to connect to, as opposed to a query failing. */
export class DatabaseSetupError extends Error {
  readonly setupNeeded = true;
  constructor(message: string) {
    super(message);
    this.name = "DatabaseSetupError";
  }
}

/**
 * Turn a driver error into something worth showing a person. The Neon HTTP
 * driver reports an unreachable host as "fetch failed", which says nothing.
 */
export function dbErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof DatabaseSetupError) return message;
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(message)) {
    return (
      "Could not reach the database. Check that DATABASE_URL in .env.local is " +
      "a real Neon connection string and that you are online. " +
      `Driver said: ${message}`
    );
  }
  return message;
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

alter table articles add column if not exists grade jsonb;
alter table articles add column if not exists ease int;
alter table articles add column if not exists readable boolean;

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
