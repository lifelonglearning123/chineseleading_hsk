# 读报 — Chinese News Reader

Read interesting Chinese at HSK 4. Tap any word for pinyin, meaning and a
character breakdown, get pinyin printed above words that are above your level,
and save what you don't know to a vocabulary list you can review.

Next.js on Vercel, Neon Postgres for storage, OpenAI for explanations.
No Supabase.

## What it does

**Today's reading.** Casual sources first, because a learner reads more of
what they enjoy.

果壳 (Guokr) supplies everyday popular science: a poisonous star anise in the
supermarket, a bear meme, why the moon is full late this year.

网易 (NetEase) supplies 时尚, 明星, 剧集, 电影 and 娱乐: lifestyle, celebrity
gossip, TV and film. This is self-media prose, so you get how people actually
write online, including words a textbook will never teach you like 官宣, 素颜
and 娱乐瓜.

游研社 (yystv) supplies games and internet culture, in short, jokey sentences.

中国新闻网 (China News Service) supplies 生活, 健康, 社会, 文化 and 体育. Its
国内, 国际, 财经 and 教育 feeds were dropped: almost everything in them was
meetings, policy and foreign names.

**Only what is worth reading.** Every downloaded article is graded
(`src/lib/grade.ts`) on three things: the share of words at HSK 4 or below,
foreign names per thousand characters (唐纳德·特朗普 is six characters of sound
that teach nothing), and official-register words like 推进, 部署 and 相关部门.
Articles that fail go to a "skipped" list at the bottom of the page rather than
the main one, and within each day the easiest come first, labelled Easy,
Medium or Harder.

**Reading view.** The article is segmented into words, not characters. Words
above your level carry pinyin above them automatically; you choose the cut-off,
from every word down to none. Words you have saved get underlined, so you can
see your own vocabulary accumulating in real text.

**Tap a word.** A panel gives pinyin, the dictionary senses, the HSK level and
a character-by-character breakdown, all instantly and offline. From there you
can save the word, mark it as one you already know, or ask for a full
explanation.

**Full explanation.** This is the one that calls the model: what each character
contributes and another common word using it, three to five words this one
habitually combines with, two example sentences pitched just above HSK 4,
near-synonyms you would confuse it with, and a memory hook. Explanations are
cached, so the same word is free the second time.

**Rewrite at HSK 4.** Articles open rewritten as a graded reader would do it,
because even light native prose is well above HSK 4: the old HSK 1-4 lists
cover only about 1,200 words, so a gossip piece scores 60-75% known words and
the rewrite brings it to 80-90%. The rewrite keeps the story, the main people
and what makes it interesting, and drops minor names, lists and officialese,
plus a short English summary. It is annotated and cached exactly like the
original. Untick **Always open at HSK 4** to open originals instead.

**My words.** Everything you saved, with the sentence you found it in and a
link back to the article. Sort by newest, hardest, or least reviewed, and run
through them as flashcards.

**Words you already know.** Marking a word as known stops it getting pinyin
forever, whatever the syllabus says. Over time the display adapts to your real
vocabulary rather than to HSK.

## Setting it up

### 1. Create the database

In the Vercel dashboard, open your project, go to **Storage**, and create a
**Neon Postgres** store. Vercel injects `DATABASE_URL` automatically. The
tables create themselves on the first request, so there is no migration step.

### 2. Environment variables

Set these in **Project → Settings → Environment Variables**:

| Variable | Needed | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Injected by Vercel when the Neon store is attached |
| `OPENAI_API_KEY` | yes | Used for explanations and rewrites |
| `OPENAI_MODEL` | no | Defaults to `gpt-5.5` |
| `CRON_SECRET` | yes | Any long random string; guards the scheduled refresh |

For local development, copy `.env.example` to `.env.local` and fill it in with
the same values.

### 3. Deploy

```
npm install
npm run build
```

Then push to a Git repository connected to Vercel, or deploy from the CLI.

`vercel.json` schedules `/api/refresh` at 06:00, 12:00 and 18:00 UTC, which
keeps the article list current without you pressing anything. The **Fetch
latest** button on the home page does the same thing on demand.

## Local development

```
npm run dev
```

Runs on <http://localhost:3280>. Webpack rather than Turbopack, because
Turbopack has a font-handling bug on Windows ARM64.

```
npm run typecheck        # tsc --noEmit
node scripts/verify.ts   # live check of feeds, segmentation and the model
```

```
node scripts/grade-sample.ts 6 science star   # grade live articles per source
```

`grade-sample.ts` prints each article's coverage, foreign-name and formality
scores and whether it passes, which is how the thresholds in `grade.ts` were
set. Bump `GRADE_VERSION` after changing them and the next refresh regrades
stored articles.

`scripts/verify.ts` fetches a real article, segments and annotates it, prints
the vocabulary it would extract, and makes one explanation and one rewrite call.
It needs `OPENAI_API_KEY` but not the database, which makes it the quickest way
to confirm the reading pipeline still works after a change.

## How the language side works

**Segmentation** is forward maximum matching against CC-CEDICT, capped at six
characters. The built-in `Intl.Segmenter` was tried first but splits common
compounds: 人民币 becomes 人民 + 币 and 联谊会 becomes 联 + 谊 + 会. Matching
against the dictionary keeps them whole, which matters because the dictionary is
also what supplies the gloss. One extra rule handles dates and measure words: a
unit directly after a number binds to the number, so the standard news dateline
9月20日电 does not match the dictionary entry 日电 ("NEC").

**Levels** come from the old HSK 1–6 scale, the one most learners quote. Words
listed only under HSK 3.0 are mapped onto it. Anything unlisted counts as 7,
"beyond HSK 6".

**Pinyin above the text** shows the first reading only. CC-CEDICT lists every
reading of a heteronym, and a wide `<rt>` stretches its base character, which
pulls the sentence visibly apart. Senses are sorted during the data build so
that everyday readings come before surname and place-name ones, otherwise 力
reads "Lì — surname Li" instead of "lì — power". The word panel still shows
every reading.

**The study list** drops proper nouns, which CC-CEDICT marks by capitalising
their pinyin. Without that filter a single article offers you 中新社, 合肥,
安徽省 and the reporter's surname as vocabulary. Lone characters are dropped too
unless they stand as words in their own right.

## Rebuilding the dictionary

`data/cedict.json` and `data/hsk.json` are generated and committed. To rebuild:

```
curl -L -o cedict.txt.gz https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
curl -L -o hsk.json https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json
python scripts/build_data.py cedict.txt.gz hsk.json
```

`next.config.ts` traces both files into the serverless bundle; without that
entry the deployed lookup route cannot find them.

## A note on the news sources

Chinese RSS is mostly dead, so each publisher needed checking rather than
assuming. What did not work: People's Daily (`people.com.cn/rss/*`) does not
respond at all; the Xinhua feeds under `news.cn` still serve XML but stopped
updating in December 2022; Sina's entertainment RSS is frozen in 2018 and its
listing page renders client-side; NetEase's `newsdata_music.js` is stale since
2022; lady, travel and baby.163.com do not respond; 知乎日报 story pages are a
JavaScript shell with no text; tech sites (少数派, 爱范儿, IT之家) work but are
thick with Latin product names. China News Service still publishes live RSS,
NetEase exposes JSONP listings (`ent.163.com/special/000380VU/newsdata_<slug>.js`,
`fashion.163.com/special/002688FE/fashion_datalist.js`) carrying titles, article
URLs and Beijing-time timestamps, Guokr has a JSON API, and 游研社 has RSS.

Adding a source is one entry in `SOURCES` in `src/lib/feeds.ts`. A source
declares how its listing is parsed (`listing`) and which container holds the
article prose (`body`); the containers live in `REGIONS` in the same file.
Everything downstream is source-agnostic.

## Credits

- Dictionary: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), CC BY-SA 4.0
- HSK lists: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary), MIT
- Articles belong to their publishers and are linked back to the source.
