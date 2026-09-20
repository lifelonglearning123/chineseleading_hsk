import OpenAI from "openai";
import type { DictEntry } from "./dict";

/**
 * OpenAI calls: deep word explanations and HSK-level rewrites.
 * Both are cached in Postgres by the routes that call them.
 */

const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

let openai: OpenAI | null = null;

function client(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it in the Vercel project settings, " +
          "or to .env.local for local development.",
      );
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

export interface CharacterNote {
  char: string;
  pinyin: string;
  meaning: string;
  note: string;
}

export interface Collocation {
  word: string;
  pinyin: string;
  meaning: string;
}

export interface Explanation {
  word: string;
  pinyin: string;
  meaning: string;
  inContext: string;
  partOfSpeech: string;
  register: string;
  characters: CharacterNote[];
  collocations: Collocation[];
  examples: { zh: string; pinyin: string; en: string }[];
  confusedWith: Collocation[];
  memoryHook: string;
}

const EXPLANATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "word",
    "pinyin",
    "meaning",
    "inContext",
    "partOfSpeech",
    "register",
    "characters",
    "collocations",
    "examples",
    "confusedWith",
    "memoryHook",
  ],
  properties: {
    word: { type: "string" },
    pinyin: { type: "string", description: "Tone-marked pinyin for the whole word." },
    meaning: { type: "string", description: "Core meaning in English, one line." },
    inContext: {
      type: "string",
      description:
        "What the word means specifically in the supplied sentence, one or two lines.",
    },
    partOfSpeech: { type: "string", description: "e.g. noun, verb, adjective, measure word." },
    register: {
      type: "string",
      description:
        "Where this word belongs: everyday speech, news/formal writing, literary, technical.",
    },
    characters: {
      type: "array",
      description: "One entry per character in the word, in order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["char", "pinyin", "meaning", "note"],
        properties: {
          char: { type: "string" },
          pinyin: { type: "string" },
          meaning: { type: "string", description: "What this character contributes." },
          note: {
            type: "string",
            description:
              "One other common word using this character, with pinyin and meaning.",
          },
        },
      },
    },
    collocations: {
      type: "array",
      description:
        "Three to five words or set phrases this word habitually combines with.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "pinyin", "meaning"],
        properties: {
          word: { type: "string" },
          pinyin: { type: "string" },
          meaning: { type: "string" },
        },
      },
    },
    examples: {
      type: "array",
      description: "Two example sentences pitched just above HSK 4.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["zh", "pinyin", "en"],
        properties: {
          zh: { type: "string" },
          pinyin: { type: "string" },
          en: { type: "string" },
        },
      },
    },
    confusedWith: {
      type: "array",
      description:
        "Up to three near-synonyms an HSK 4 learner would mix this up with, each with the distinction.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "pinyin", "meaning"],
        properties: {
          word: { type: "string" },
          pinyin: { type: "string" },
          meaning: {
            type: "string",
            description: "How it differs from the target word.",
          },
        },
      },
    },
    memoryHook: {
      type: "string",
      description: "One concrete sentence to make the word stick.",
    },
  },
} as const;

export async function explainWord(
  word: string,
  context: string,
  dictEntry: DictEntry | null,
): Promise<Explanation> {
  const reference = dictEntry
    ? `Dictionary reference (CC-CEDICT): ${dictEntry.pinyin} — ${dictEntry.defs.join("; ")}`
    : "No dictionary entry available; rely on your own knowledge.";

  const res = await client().responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a Chinese tutor for an English-speaking learner at HSK 4 who is " +
          "reading mainland news. Explain vocabulary precisely and concretely. " +
          "Use simplified characters and tone-marked pinyin throughout. Keep every " +
          "field short enough to read on a phone. Never pad.",
      },
      {
        role: "user",
        content:
          `Word: ${word}\n` +
          `Sentence it appeared in: ${context || "(not supplied)"}\n` +
          `${reference}\n\n` +
          "Explain this word for me.",
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "word_explanation",
        strict: true,
        schema: EXPLANATION_SCHEMA,
      },
    },
  });

  return JSON.parse(res.output_text) as Explanation;
}

export interface SimplifiedArticle {
  title: string;
  paragraphs: string[];
  englishSummary: string;
}

const SIMPLIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "paragraphs", "englishSummary"],
  properties: {
    title: { type: "string", description: "The headline rewritten at the target level." },
    paragraphs: {
      type: "array",
      description: "The article rewritten, one string per paragraph.",
      items: { type: "string" },
    },
    englishSummary: {
      type: "string",
      description: "Two or three sentences of English summary.",
    },
  },
} as const;

export async function simplifyArticle(
  title: string,
  body: string,
  level = 4,
): Promise<SimplifiedArticle> {
  const res = await client().responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content:
          `Rewrite mainland Chinese news at HSK ${level} level, the way a graded ` +
          "reader does. Keep every fact, name, number and date from the original. " +
          "Prefer HSK 1-" +
          level +
          " vocabulary and short sentences. Where a harder term is unavoidable " +
          "(a place name, an institution, a technical term), keep it rather than " +
          "distorting the meaning. Simplified characters only. Do not add commentary.",
      },
      {
        role: "user",
        content: `Headline: ${title}\n\nArticle:\n${body.slice(0, 6000)}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "simplified_article",
        strict: true,
        schema: SIMPLIFY_SCHEMA,
      },
    },
  });

  return JSON.parse(res.output_text) as SimplifiedArticle;
}
