# Learning Chinese App — progress / handoff notes

Read this first if you are a new model/session picking up the work.
Update it after every meaningful step.

## Goal (from the user, 2026-10-18)
An iPhone app for learning Mandarin Chinese.
- Home screen with sections:
  1. **Nouns** — flashcards
  2. **Verbs** — flashcards
  3. **Adjectives** — flashcards
  4. **Proverbs** — famous sayings / chengyu
  5. **Everyday sentences** — full sentences
  6. **Counting** — numbers and measure words (量词)
- Every card teaches **hanzi + pinyin + English**.
- Two directions: **English → hanzi+pinyin** and **hanzi+pinyin → English**.
- **Images / visual aids** to help memorise the hanzi.
- Each section is divided into **chapters**. A chapter is **complete** when a full run
  through its words is done **without mistakes**.
- Must be easy ("seamless") to get onto the user's iPhone.
- User wants progress saved throughout so work can continue with a different model.

## Environment facts
- Mac has only Command Line Tools — **Xcode is NOT installed** (no `xcodebuild`).
- No `node`, no `gh`. `python3` (Homebrew 3.13) and `git` exist.
- => Native SwiftUI app would need a ~15 GB Xcode install + Apple ID signing
  (free Apple ID: app must be reinstalled every 7 days).
- => Recommended route: installable **web app (PWA)** — open in Safari → Share →
  Add to Home Screen. Works offline, no expiry.

## Decisions (answered by user 2026-10-18)
- Platform: **home-screen web app (PWA)**, plain HTML/CSS/JS, no build step.
- Extra features: **Audio + tone colors** (TTS via speechSynthesis zh-CN, tone-colored
  pinyin AND hanzi, a "Tones" section with a listen-and-pick-the-tone quiz),
  **Spaced repetition** (daily review queue, streak, daily goal),
  **More quiz types** (multiple choice, listening, type pinyin, sentence/idiom tile builder).
  NOT chosen: stroke order / handwriting.
- Level: **Beginner, HSK 1–2**.
- Visual aids: emoji per word + memory hook (component breakdown + mnemonic)
  + small SVG pictographs for picture characters (人 山 木 日 月 口 …), drawn in app.js.
- Chapter completion rule: a run asks every item once (missed items re-queue at the end);
  the run is "perfect" only with 0 mistakes. First perfect run => chapter complete ✓.
  Bonus stars: one per direction perfected (EN→中, 中→EN).
- [pending] Hosting: GitHub Pages (best: real offline PWA; user needs a GitHub account)
  vs claude.ai artifact link. Ask the user once the app works.

## Layout
- `app/` — everything that gets deployed (index.html, css/, js/, js/data/, sw.js, manifest, icons/)
- `app/js/data/<section>.js` — content, format in `DATA_FORMAT.md`
- `tools/validate.py` — checks every data file (hanzi/pinyin alignment, fields, readings)
- Local preview: `python3 -m http.server 8765 --directory app` (see .claude/launch.json)

## Status
- [x] Requirements captured
- [x] Decisions answered by user
- [x] Data format + validator (`DATA_FORMAT.md`, `tools/validate.py`)
- [x] Content done + validated: nouns (130), sentences (64), proverbs (29), counting (81), tones (44)
- [x] Content: verbs (80) + adjectives (60). Total 488 items, 51 chapters, all validate.
- [x] App built: `app/index.html`, `app/css/style.css`, `app/js/app.js` (home, sections,
      chapters, runs in 6 modes, review/SRS, weak words, words search, settings, backup,
      number drill, 22 SVG pictographs).
- [x] Icons (`sh tools/make_icons.sh`, uses qlmanage+sips — Swift toolchain on this Mac is broken),
      manifest, `sw.js` (run `python3 tools/stamp.py` after ANY app change to bump the cache).
      SW is skipped on localhost unless `?sw=1`.
- [x] Scripted test in browser (375×812): every chapter × every mode played to a perfect run;
      mistakes block completion; stars per direction; review session (20 at a time) works;
      gradePinyin accepts marked/numbered/toneless pinyin for all 488 items; numZh/numPy checked.
- [x] Visual pass of all screens in dark + light at 375×812; offline cache verified (16 files).
- [x] **Hosting — GitHub Pages (2026-10-18), live. See "Live" below.**
      Done: `gh` installed via Homebrew; README.md + .gitignore written; signed in with
      `gh auth login --web` as GitHub user **niklaseckert-lang** (id 264371162).
      (The terminal-panel sign-in didn't work for the user; running it in the background
      and giving them the device code + https://github.com/login/device did.)
      Repo: github.com/niklaseckert-lang/learn-chinese → app at
      https://niklaseckert-lang.github.io/learn-chinese/
      Steps: `git init -b main`; set LOCAL git user.name = GitHub login and user.email =
      `<id>+<login>@users.noreply.github.com` (from `gh api user`) so their email stays private;
      commit; `gh repo create learn-chinese --public --source . --push`;
      `git subtree push --prefix app origin gh-pages`;
      enable Pages: `gh api -X POST repos/<login>/learn-chinese/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'`;
      URL will be `https://<login>.github.io/learn-chinese/`. Then give the user iPhone install steps.
      After any later change: validate → stamp → commit → push → subtree push.
- [ ] Hosted + installed on iPhone

## Live (2026-10-18)
- Published: https://niklaseckert-lang.github.io/learn-chinese/ (repo niklaseckert-lang/learn-chinese,
  `main` = full project, `gh-pages` = `app/` via `git subtree push --prefix app origin gh-pages`).
- If the iPhone shows a "critical security threat" page, the site itself is fine (valid cert, not on
  Google Safe Browsing). It's a filter on the phone or network; the user got past it.

## Change 1: typed flashcards (branch `feature/typed-flashcards`)
- User asked: flashcards should make you WRITE the answer and auto-grade it (no "Knew it / Didn't know").
- Flashcards (`flash` mode) now take typed input. EN→中: pinyin (marked or tone numbers, toneless
  accepted unless strict) or 汉字. 中→EN: English, graded by `gradeEnglish` (typos via Levenshtein,
  articles/"to", contractions, each `;` sense, `/` alternatives, parentheses, plural -s; numbers exact;
  sentences/sayings by content-word overlap ≥ 75%). Wrong answers wait in state `checked` with
  "I was right" (counts right) / "Continue" (counts wrong).
- The separate "Type the pinyin" mode was removed (flashcards EN→中 cover it). Review now mixes in
  written flashcards (weights: choice 3, flash 2, others 1).
- Tested: all 444 non-tone items accept their pinyin/numbered/hanzi and every English sense;
  only one false positive between chapter-mates (送 accepts "to give"). Flow tested incl. overrule.

Merged into main 2026-10-18.

## Change 2: stricter progress (branch `feature/stricter-progress`)
- User asked: a word is "learned" only after being WRITTEN right 3 times in a row; a chapter is
  complete only after 2 passes. User chose: passes = mistake-free ✍️ Flashcards runs only (either
  direction). Tones section (no written mode) uses the 🎵 Tone quiz for both rules.
- Per word (`S.srs[id]`): `ws` = consecutive first-try correct written answers (one per run/review),
  `L` = timestamp when learned (sticky). Per chapter: `passes`, `done` at 2, stars per direction.
- Saved state has `v: 2`; `upgrade()` clears v1 chapter completions and learned flags (they came
  from self-graded cards) but keeps the review schedule, streak days and settings. Backups go
  through `upgrade()` too.
- Stages: New / Practising / Learned / Mastered (learned + review box ≥ 5).
- Tested: upgrade from a v1 save; MC perfect = practice only; pass 1 → pass 2 = complete; a miss
  resets that word's count; learned after 3 written runs; tone quiz passes in Tones.

Merged into main 2026-10-18.

## Change 3: wait for Continue + working slow audio (branch `feature/continue-and-slow-audio`, 2026-10-19)
- No more auto-advance after correct answers; every answer waits for Continue.
- iOS 17.1+ appears to ignore the speech rate (Apple forum thread 741356 reports it for
  AVSpeechSynthesizer, which Safari's speechSynthesis uses). So 🐢 now also splits the speech with
  "，" pauses via `slowText(text, pinyin)`. Sentences go word by word (they have word spaces),
  everything else syllable by syllable; neutral-tone syllables stay with the previous piece and
  一/不 stay with the next. All slow buttons pass pinyin via `data-p`. Single syllables can't be split.
- Not published as recorded audio files: macOS system voices may not be redistributed.
- Local preview port moved to 8766 (8765 is used by the Biophysics Course session's server).

Merged into main 2026-10-19.

## Change 4: slower 🐢 + visible version (branch `feature/slower-slow-mode`, 2026-10-19)
- User wasn't sure the previous update arrived and wanted 🐢 even slower.
- 🐢 now speaks each piece from `slowChunks()` as its own utterance, chained on `onend` with a
  pause (`settings.slowGap`: short 350 / medium 700 / long 1200 ms; Settings → "🐢 Slow mode pauses").
  Utterances are kept in `Speech.live` (Safari drops onend for GC'd utterances), a timeout covers
  a missing onend, and `Speech.seq` cancels an old sequence when new audio starts.
- `APP_VERSION` is now real (1.4) and shown on Home + Settings. **Bump it on every release.**
- Settings → "Check for updates": `reg.update()`, then reloads on `controllerchange`.

Merged into main 2026-10-19 (first push failed during a Mac kernel panic; retry worked).

## Change 5: even slower 🐢 — v1.5 (branch `feature/even-slower`, 2026-10-19)
- Setting renamed "🐢 How slow": Slow / Slower / Slowest (keys still short/medium/long, so saved
  choices carry over). Pauses now 600 / 1100 / 1600 ms; default Slower.
- Slowest also splits sentences syllable by syllable (`slowChunks(text, p, bySyllable)`), still
  keeping neutral tones and 一/不 attached.

## Content plan (verbs + adjectives, in case they need redoing)
- verbs.js (id verbs, 动词 dòng cí, 🏃, English "to …"): essentials 是 有 在 去 来 要 想 会 能 可以 ·
  daily-life 吃 喝 睡觉 起床 洗澡 穿 做饭 上班 回家 休息 · moving 走 跑 坐 站 进 出 到 回 开车 骑 ·
  talking 说 听 看 读 写 问 回答 叫 告诉 打电话 · thinking 喜欢 爱 觉得 知道 认识 懂 希望 忘记 记得 相信 ·
  doing 买 卖 给 做 用 找 等 帮助 送 拿 · study-work 学习 工作 教 开始 结束 准备 练习 复习 上课 下课 ·
  free-time 玩 唱歌 跳舞 游泳 旅游 运动 踢足球 打篮球 笑 哭
- adjectives.js (id adjectives, 形容词 xíng róng cí, 🎨): basics 大 小 多 少 好 坏 新 旧 长 短 ·
  feelings 高兴 快乐 累 饿 渴 忙 生气 难过 舒服 紧张 · people 高 矮 胖 瘦 漂亮 帅 聪明 年轻 老 可爱 ·
  colors 红色 黄色 蓝色 绿色 白色 黑色 紫色 灰色 粉色 橙色 · qualities 贵 便宜 快 慢 远 近 难 容易 热 冷 ·
  more 好吃 好看 干净 安静 有意思 重要 方便 简单 对 错

## Notes from content helpers
- tones: 飞机→西瓜 and 大学→面条 (avoid repeating characters inside the section).
- sentences: mid-sentence comma written as "我 很 好， 谢谢。" so 谢谢 is its own tile.
- 多少 written duō shao; 马马虎虎 mǎ ma hū hū; capitals on country/language pinyin.
