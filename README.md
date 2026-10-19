# 学中文 · Learn Chinese

A beginner (HSK 1–2) Mandarin app for iPhone, built as an installable web app.
Open the published page in Safari → Share → **Add to Home Screen**. It then runs full screen and offline.

**Sections:** Nouns · Verbs · Adjectives · Proverbs · Everyday sentences · Counting (numbers + measure words) · Tones —
488 cards in 51 chapters. A chapter is complete after one run with no mistakes.

**Study modes:** flashcards (English → 中文 and 中文 → English), multiple choice, listening, type the pinyin,
build the sentence/idiom from tiles, tone quiz, number drill. Daily spaced-repetition review, weak-word practice,
tone-colored hanzi and pinyin, iPhone text-to-speech, memory hooks and pictographs for each character.

## Project layout

| Path | What |
|------|------|
| `app/` | The deployed app (plain HTML/CSS/JS, no build step) |
| `app/js/data/*.js` | Content, one file per section — format in `DATA_FORMAT.md` |
| `tools/validate.py` | Checks every content file (run after editing content) |
| `tools/stamp.py` | Updates the offline cache list/version in `app/sw.js` (run after any app change) |
| `tools/make_icons.sh` | Regenerates the icons |
| `PROGRESS.md` | Build log and hand-off notes |

## Develop and publish

```bash
python3 -m http.server 8766 --directory app      # preview at http://localhost:8766
python3 tools/validate.py && python3 tools/stamp.py
git add -A && git commit -m "…" && git push      # then publish the app folder:
git subtree push --prefix app origin gh-pages
```
