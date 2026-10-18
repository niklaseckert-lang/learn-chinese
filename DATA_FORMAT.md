# Content data format

Each section lives in `app/js/data/<section-id>.js`. The file is **one call** whose
argument is **strict JSON** (double quotes, no comments, no trailing commas):

```
ZH.add({
  "id": "nouns",
  ...
});
```

The first line must be exactly `ZH.add({` and the last line exactly `});`.
Run `python3 tools/validate.py app/js/data/<file>.js` after every edit — it must print `OK`.

## Section object

| field    | type   | notes |
|----------|--------|-------|
| id       | string | `nouns`, `verbs`, `adjectives`, `proverbs`, `sentences`, `counting`, `tones` |
| title    | string | English, e.g. "Nouns" |
| zh       | string | Chinese name, e.g. "名词" |
| py       | string | pinyin of `zh`, syllables space-separated, e.g. "míng cí" |
| icon     | string | one emoji |
| desc     | string | one short English line |
| chapters | array  | chapter objects, in teaching order |

## Chapter object

| field | type   | notes |
|-------|--------|-------|
| id    | string | kebab-case, unique within the section, e.g. "family" |
| title | string | English, e.g. "Family" |
| zh    | string | short Chinese title, e.g. "家人" |
| items | array  | 8–10 items (proverbs: 7–8) |

## Item object

| field | required for | notes |
|-------|--------------|-------|
| h   | all | Simplified hanzi. **Sentences section only:** put a single space between words (used for the tile builder); punctuation sticks to the previous word with no space, e.g. `"你 叫 什么 名字？"`. Everywhere else: no spaces. |
| p   | all | Pinyin with tone marks, **one syllable per hanzi, syllables separated by single spaces**: `"mā ma"`, `"péng you"`, `"gōng gòng qì chē"`. Neutral tone = no mark. Use ü marks `ǖ ǘ ǚ ǜ` (`nǚ`, `lǜ`). Sentences/proverbs: capitalise the first letter, attach ASCII punctuation to the previous syllable: `"Nǐ jiào shén me míng zi?"` |
| e   | all | English meaning, short. Several senses separated by `; `. No leading "to " for verbs is fine either way, but be consistent within a section (use "to eat"). |
| img | nouns, verbs, adjectives (strongly preferred elsewhere) | 1 emoji (max 2) that pictures the meaning. |
| m   | nouns, verbs, adjectives, proverbs, counting | Memory hook, ≤ 220 chars. Break the characters into **real** components and give a vivid mnemonic, e.g. `"好 = 女 woman + 子 child. A woman with her child — that's good."` Present invented stories as mnemonics, never as false etymology. For proverbs: the story/origin and when to use it (≤ 320 chars). |
| x   | nouns, verbs, adjectives | Example sentence `[hanzi, pinyin, english]`, ≤ 14 hanzi, HSK 1–2 vocabulary, hanzi **without** spaces. Pinyin follows the same one-syllable-per-hanzi rule. |
| mw  | nouns (when natural) | Measure word `[hanzi, pinyin]`, e.g. `["只", "zhī"]`. Omit for nouns that don't take one (time words, places used bare, etc.). |
| n   | optional | Short usage/grammar note (≤ 160 chars). |
| lit | proverbs | Word-for-word literal translation. |
| eq  | proverbs (optional) | Closest English saying. |

## Pinyin and character rules

- Simplified characters only. No Arabic digits, Latin letters or 儿-erhua words in `h`
  (write 哪里 not 哪儿, 一点 not 一点儿, 二〇二六 not 2026).
- Chinese punctuation in `h` (`，。？！`), ASCII punctuation in `p` (`, . ? !`).
- Write **一 and 不 with the tone actually spoken** (tone sandhi): 不是 `bú shì`,
  不好 `bù hǎo`, 一个 `yí ge`, 一起 `yì qǐ`, 一样 `yí yàng`, but 第一 `dì yī`, 十一 `shí yī`.
- Do **not** mark third-tone sandhi: 你好 stays `nǐ hǎo`.
- 个 as a measure word is neutral: `ge`.
- Avoid characters with an ambiguous reading for text-to-speech when a clearer word exists.
- Level: HSK 1–2 (beginner). Prefer the most common, most useful words.
