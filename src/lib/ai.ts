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

const EXPLANATION_SYSTEM =
  "You are a Chinese tutor for an English-speaking learner at HSK 4 who is " +
  "reading mainland news. Explain vocabulary precisely and concretely. " +
  "Use simplified characters throughout, and write pinyin with tone marks and " +
  "a space between syllables, like zhà piàn rather than zhàpiàn. Keep every " +
  "field short enough to read on a phone. Never pad.\n\n" +
  "Every array in the schema must be non-empty. In particular `examples` must " +
  "contain exactly two sentences: strict mode cannot enforce that, so it is on " +
  "you. An explanation without examples is useless to a learner.";

/**
 * One explanation. The model occasionally returns an empty `examples` array
 * even though the schema asks for two sentences, because OpenAI strict mode
 * does not support minItems. One retry costs less than shipping a word panel
 * with no example in it.
 */
export async function explainWord(
  word: string,
  context: string,
  dictEntry: DictEntry | null,
): Promise<Explanation> {
  const reference = dictEntry
    ? `Dictionary reference (CC-CEDICT): ${dictEntry.pinyin} — ${dictEntry.defs.join("; ")}`
    : "No dictionary entry available; rely on your own knowledge.";

  const ask = async (nudge: string): Promise<Explanation> => {
    const res = await client().responses.create({
      model: MODEL,
      input: [
        { role: "system", content: EXPLANATION_SYSTEM },
        {
          role: "user",
          content:
            `Word: ${word}\n` +
            `Sentence it appeared in: ${context || "(not supplied)"}\n` +
            `${reference}\n\n` +
            `Explain this word for me.${nudge}`,
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
  };

  const first = await ask("");
  if (first.examples?.length) return first;

  const second = await ask(
    " Your previous attempt left `examples` empty. Return exactly two example " +
      "sentences this time, each with Chinese, spaced pinyin and an English translation.",
  );
  // If the model refuses twice, keep the rest rather than failing the request.
  return second.examples?.length ? second : first;
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

/**
 * Bumped whenever the rewrite prompt changes enough that cached rewrites
 * should be thrown away. 2: shorter, drops minor and foreign names.
 */
export const SIMPLIFY_VERSION = 2;

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
          `Rewrite a Chinese article as a graded reader at HSK ${level} level, ` +
          "for an adult learner reading for pleasure.\n\n" +
          `Vocabulary: use HSK 1-${level} words wherever one will do. Allow at ` +
          "most one or two harder words per paragraph, and only when the story " +
          "depends on them.\n" +
          "Sentences: short, one idea each, everyday spoken-style grammar. " +
          "Replace written and official phrasing (据悉, 相关部门, 推进, 予以, 及) " +
          "with plain words.\n" +
          "Names: keep the one or two people the story is about. Refer to everyone " +
          "else by who they are (他的妻子, 一位导演, 一个美国演员) rather than by name, " +
          "and write a foreign name at most once. Drop titles of minor works, " +
          "organisations and places the story does not need.\n" +
          "Content: keep what makes the story interesting and cut the rest. It is " +
          "fine to leave out minor figures, lists and background. Aim for about " +
          "300-600 characters. Do not invent facts or add commentary.\n" +
          "The article is already published; your job is only to retell it. " +
          "Never refuse, fact-check, warn, or speak to the reader about the task: " +
          "the output must read as the article itself.\n" +
          "Simplified characters only.",
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
