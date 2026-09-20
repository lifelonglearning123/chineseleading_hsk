"""Build compact dictionary + HSK data files from CC-CEDICT and the
complete-hsk-vocabulary dataset.

Usage:
    python scripts/build_data.py <cedict.txt.gz> <hsk_complete.json>

Outputs:
    data/cedict.json  -> { simplified: [pinyin, [definitions...]] }
    data/hsk.json     -> { simplified: level }   (old HSK 1-6 where known,
                                                  else new HSK band + 10)
Sources:
    CC-CEDICT      https://www.mdbg.net/chinese/dictionary?page=cc-cedict  (CC BY-SA 4.0)
    HSK vocabulary https://github.com/drkameleon/complete-hsk-vocabulary   (MIT)
"""

import gzip
import json
import os
import re
import sys

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

TONE_MARKS = {
    "a": "āáǎàa",
    "e": "ēéěèe",
    "i": "īíǐìi",
    "o": "ōóǒòo",
    "u": "ūúǔùu",
    "v": "ǖǘǚǜü",
}

SYLLABLE_RE = re.compile(r"^([a-zA-Z:]+)([1-5])$")


def numeric_to_marks(syllable: str) -> str:
    """Convert one CC-CEDICT numeric syllable (e.g. 'hao3') to tone marks."""
    m = SYLLABLE_RE.match(syllable)
    if not m:
        return syllable.replace("u:", "ü").replace("U:", "Ü")
    body, tone = m.group(1), int(m.group(2))
    body = body.replace("u:", "v").replace("U:", "V")
    if tone == 5:
        return body.replace("v", "ü").replace("V", "Ü")

    lower = body.lower()
    # Standard tone-mark placement rules.
    if "a" in lower:
        idx = lower.index("a")
    elif "o" in lower and "ou" in lower:
        idx = lower.index("o")
    elif "e" in lower:
        idx = lower.index("e")
    elif "ou" in lower:
        idx = lower.index("o")
    else:
        # Otherwise the last vowel takes the mark (iu -> u, ui -> i).
        idx = -1
        for i, ch in enumerate(lower):
            if ch in "aeiouv":
                idx = i
        if idx < 0:
            return body.replace("v", "ü")

    ch = lower[idx]
    marked = TONE_MARKS[ch][tone - 1]
    if body[idx].isupper():
        marked = marked.upper()
    out = body[:idx] + marked + body[idx + 1 :]
    return out.replace("v", "ü").replace("V", "Ü")


def convert_pinyin(raw: str) -> str:
    parts = raw.split()
    return " ".join(numeric_to_marks(p) for p in parts)


CJK_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
# Definitions that are cross-references rather than meanings get pushed last.
LOW_VALUE_RE = re.compile(r"^(variant of|old variant of|see |see also|abbr\. for|CL:|surname )", re.I)


SURNAME_RE = re.compile(r"^surname\b", re.I)


def sense_rank(pinyin: str, defs: list) -> int:
    """
    Order the senses of a headword so the everyday reading comes first.

    CC-CEDICT lists a character's surname reading alongside its ordinary one,
    and the surname often comes first alphabetically. Left alone that makes
    力 read "Lì — surname Li" rather than "lì — power", which is wrong for a
    reader. Proper-noun readings are capitalised in CC-CEDICT pinyin, so that
    plus an explicit "surname" gloss is enough to demote them.
    """
    if defs and SURNAME_RE.match(defs[0]):
        return 3
    if any(syl[:1].isupper() for syl in pinyin.split()):
        return 2
    if defs and LOW_VALUE_RE.match(defs[0]):
        return 1
    return 0


def build_cedict(path: str) -> dict:
    # word -> list of (pinyin, [definitions]) senses, kept paired so that
    # demoting a sense moves its pinyin with it.
    entries: dict[str, list] = {}

    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or not line.strip():
                continue
            m = re.match(r"^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+/(.*)/\s*$", line.strip())
            if not m:
                continue
            simplified, pinyin_raw, defs_raw = m.group(2), m.group(3), m.group(4)
            if not CJK_RE.search(simplified):
                continue
            if len(simplified) > 12:
                continue

            defs = [d.strip() for d in defs_raw.split("/") if d.strip()]
            if not defs:
                continue

            entries.setdefault(simplified, []).append((convert_pinyin(pinyin_raw), defs))

    out = {}
    for word, senses in entries.items():
        senses.sort(key=lambda s: sense_rank(s[0], s[1]))

        pinyins, defs = [], []
        for pinyin, sense_defs in senses:
            if pinyin and pinyin not in pinyins:
                pinyins.append(pinyin)
            for d in sense_defs:
                if d not in defs:
                    defs.append(d)

        out[word] = ["; ".join(pinyins[:3]), [d[:110] for d in defs[:5]]]
    return out


def build_hsk(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    # The dataset tags each word with any of three syllabi:
    #   old-1..old-6      HSK 2.0, the familiar 1-6 scale most learners quote
    #   new-1..new-7      HSK 3.0 bands
    #   newest-1..        a further revision
    # We report the old 1-6 scale, mapping new bands onto it when a word is
    # only listed under HSK 3.0.
    NEW_TO_OLD = {1: 1, 2: 2, 3: 4, 4: 5, 5: 6, 6: 6, 7: 7}

    out: dict[str, int] = {}
    for item in data:
        word = item.get("simplified")
        if not word:
            continue
        old_levels, new_levels = [], []
        for lv in item.get("level", []):
            if not isinstance(lv, str):
                continue
            prefix, _, tail = lv.rpartition("-")
            if not tail.isdigit():
                continue
            if prefix == "old":
                old_levels.append(int(tail))
            elif prefix == "new":
                new_levels.append(int(tail))
        if old_levels:
            level = min(old_levels)
        elif new_levels:
            level = NEW_TO_OLD.get(min(new_levels), 7)
        else:
            continue
        if word not in out or level < out[word]:
            out[word] = level
    return out


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    cedict = build_cedict(sys.argv[1])
    hsk = build_hsk(sys.argv[2])

    cedict_path = os.path.join(OUT_DIR, "cedict.json")
    hsk_path = os.path.join(OUT_DIR, "hsk.json")

    with open(cedict_path, "w", encoding="utf-8") as fh:
        json.dump(cedict, fh, ensure_ascii=False, separators=(",", ":"))
    with open(hsk_path, "w", encoding="utf-8") as fh:
        json.dump(hsk, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"cedict entries : {len(cedict):,}  -> {os.path.getsize(cedict_path)/1e6:.2f} MB")
    print(f"hsk entries    : {len(hsk):,}  -> {os.path.getsize(hsk_path)/1e6:.2f} MB")
    sample = ["人民币", "联谊会", "深空", "你好", "潜力", "聚变"]
    for s in sample:
        print(" ", s, cedict.get(s, "—"), "HSK", hsk.get(s, "-"))


if __name__ == "__main__":
    main()
