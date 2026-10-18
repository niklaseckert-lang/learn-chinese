/* 学中文 · Learn Chinese — a no-build single-page web app.
   Content lives in js/data/*.js (format: DATA_FORMAT.md). Progress is kept in localStorage. */
(function () {
  'use strict';

  const APP_VERSION = '1.0.0';
  const SECTION_ORDER = ['nouns', 'verbs', 'adjectives', 'proverbs', 'sentences', 'counting', 'tones'];
  const MODES = {
    flash: { icon: '✍️', name: 'Flashcards', desc: 'Write the answer: pinyin, 汉字 or English', dirs: true },
    choice: { icon: '✅', name: 'Multiple choice', desc: 'Pick the right answer out of four', dirs: true },
    listen: { icon: '👂', name: 'Listening', desc: 'Hear it, pick the meaning', dir: 'zh2en' },
    build: { icon: '🧩', name: 'Build it', desc: 'Tap the pieces in the right order', dir: 'en2zh' },
    tone: { icon: '🎵', name: 'Tone quiz', desc: 'Hear it, pick the tone', dir: 'tone' },
  };
  const WORD_MODES = ['flash', 'choice', 'listen'];
  const SECTION_MODES = {
    nouns: WORD_MODES, verbs: WORD_MODES, adjectives: WORD_MODES, counting: WORD_MODES,
    proverbs: ['flash', 'choice', 'listen', 'build'],
    sentences: ['flash', 'choice', 'listen', 'build'],
    tones: ['tone'],
  };
  const TONE_NAME = { 1: 'high & flat', 2: 'rising', 3: 'dipping', 4: 'falling', 5: 'neutral' };
  const TONE_ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: 'neutral' };
  const PRAISE = ['Correct! 对！', 'Great! 很好！', 'Nice! 太棒了！', 'Yes! 没错！'];
  const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64, 128]; // days until the next review, by box
  const REVIEW_SIZE = 20;

  // ---------- small helpers ----------
  const appEl = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const dayKey = (t) => { const d = new Date(t ?? Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const addDays = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime(); };
  function relDay(t) {
    const n = Math.round((new Date(t).setHours(0, 0, 0, 0) - addDays(0)) / 86400000);
    return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  }
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ---------- saved state ----------
  const STORE_KEY = 'xuezhongwen.v1';
  const DEFAULT_SETTINGS = { toneColors: true, showPinyin: true, autoplay: true, rate: 0.8, strictTones: false, dailyGoal: 20, theme: 'auto', dirs: {}, hideInstall: false };
  const freshState = () => ({ srs: {}, chapters: {}, days: {}, last: null, drillBest: 0, settings: { ...DEFAULT_SETTINGS } });
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { const s = JSON.parse(raw); return { ...freshState(), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } }; }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return freshState();
  }
  let S = loadState();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ Progress could not be saved'); }
  }
  (function pruneDays() {
    const cutoff = dayKey(addDays(-400));
    for (const k of Object.keys(S.days)) if (k < cutoff) delete S.days[k];
  })();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- content index ----------
  const SEC = {}, ITEMS = {}, SECTIONS = [];
  for (const sid of SECTION_ORDER) {
    const s = window.ZH && window.ZH.sections[sid];
    if (!s) continue;
    SECTIONS.push(s); SEC[sid] = s; s.all = [];
    s.chapters.forEach((ch, ci) => {
      ch.sid = sid; ch.key = `${sid}/${ch.id}`; ch.index = ci;
      ch.items.forEach((it) => {
        it.sid = sid; it.ch = ch; it.hz = it.h.replace(/ /g, ''); it.id = `${sid}:${it.hz}`;
        ITEMS[it.id] = it; s.all.push(it);
      });
    });
  }
  const chapterOf = (sid, cid) => SEC[sid] && SEC[sid].chapters.find((c) => c.id === cid);
  const chState = (ch) => S.chapters[ch.key] || {};

  // ---------- pinyin & tones ----------
  const MARKED = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
  const PLAIN = 'aaaaeeeeiiiioooouuuuüüüü';
  const isHan = (c) => /[\u3400-\u9fff\u3007]/.test(c);
  function toneOf(syl) {
    for (const c of syl.toLowerCase()) { const i = MARKED.indexOf(c); if (i >= 0) return (i % 4) + 1; }
    return 5;
  }
  function toneless(s) { let o = ''; for (const c of s) { const i = MARKED.indexOf(c); o += i >= 0 ? PLAIN[i] : c; } return o; }
  const letters = (s) => [...s.toLowerCase()].filter((c) => (c >= 'a' && c <= 'z') || c === 'ü' || MARKED.includes(c)).join('');
  const tonesOf = (p) => p.trim().split(/\s+/).map(toneOf);
  // One entry per character: hanzi get their syllable (c, s, t); punctuation gets t = 0.
  function align(h, p) {
    const syl = p.trim().split(/\s+/);
    let k = 0; const out = [];
    for (const c of h) {
      if (c === ' ') continue;
      if (isHan(c)) { const s = syl[k++] || ''; out.push({ c, s: letters(s), t: toneOf(s) }); }
      else out.push({ c, s: '', t: 0 });
    }
    return out;
  }
  function hz(h, p, cls = '') {
    const inner = align(h, p).map((x) => (x.t ? `<span class="t${x.t}">${esc(x.c)}</span>` : esc(x.c))).join('');
    return `<span class="hz ${cls}" lang="zh-Hans">${inner}</span>`;
  }
  function py(p, cls = '') {
    return `<span class="py ${cls}">${p.trim().split(/\s+/).map((s) => `<span class="t${toneOf(s)}">${esc(s)}</span>`).join(' ')}</span>`;
  }
  const CONTOUR = { 1: [[4, 5], [36, 5]], 2: [[4, 3], [36, 5]], 3: [[4, 2], [18, 1], [36, 4]], 4: [[4, 5], [36, 1]] };
  function contour(t) {
    const shape = t === 5
      ? '<circle cx="20" cy="17" r="3.5" fill="currentColor"/>'
      : `<polyline points="${CONTOUR[t].map(([x, l]) => `${x},${28 - l * 4.8}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<svg class="contour t${t}" viewBox="0 0 40 28" aria-hidden="true">${shape}</svg>`;
  }

  // ---------- speech ----------
  const Speech = {
    ok: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    voice: null,
    init() {
      if (!this.ok) return;
      const choose = () => {
        const vs = speechSynthesis.getVoices();
        const cn = vs.filter((v) => /zh[-_]CN/i.test(v.lang));
        this.voice = cn.find((v) => /enhanced|premium|tingting|婷婷/i.test(v.name)) || cn[0]
          || vs.find((v) => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang)) || null;
      };
      choose();
      speechSynthesis.onvoiceschanged = choose;
    },
    say(text, slow) {
      if (!this.ok) { toast('Audio is not available in this browser'); return; }
      const u = new SpeechSynthesisUtterance(String(text).replace(/\s+/g, ''));
      u.lang = 'zh-CN';
      if (this.voice) u.voice = this.voice;
      u.rate = slow ? Math.max(0.35, S.settings.rate * 0.6) : S.settings.rate;
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
        setTimeout(() => speechSynthesis.speak(u), 80);
      } else speechSynthesis.speak(u);
    },
    // iOS only allows speech after a user gesture; speaking a silent utterance on the first tap unlocks it.
    unlock() {
      if (!Speech.ok || Speech.unlocked) return;
      Speech.unlocked = true;
      const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
    },
  };
  const sayBtn = (text, label = '🔊', cls = '') => `<button class="say ${cls}" data-act="say" data-t="${esc(text)}" aria-label="Play audio">${label}</button>`;
  const slowBtn = (text, label = '🐢') => `<button class="say slow" data-act="say" data-slow="1" data-t="${esc(text)}" aria-label="Play slowly">${label}</button>`;

  // ---------- pictographs (picture → character) ----------
  const PICTO = {
    人: ['A person striding along on two legs', '<circle cx="50" cy="17" r="9"/><path d="M50 27 L50 56 M50 56 L30 90 M50 56 L70 90 M50 38 L32 56 M50 38 L68 56"/>'],
    大: ['A person stretching their arms out wide — big!', '<circle cx="50" cy="16" r="9"/><path d="M12 40 L88 40 M50 26 L50 58 M50 58 L26 90 M50 58 L74 90"/>'],
    天: ['The sky (top line) above a big person', '<path d="M18 9 L82 9"/><circle cx="50" cy="26" r="8"/><path d="M14 46 L86 46 M50 35 L50 62 M50 62 L28 92 M50 62 L72 92"/>'],
    口: ['An open mouth', '<path d="M16 36 Q50 18 84 36 Q78 80 50 82 Q22 80 16 36 Z M28 44 Q50 56 72 44"/>'],
    日: ['The sun with a spot in the middle', '<circle cx="50" cy="50" r="26"/><path d="M38 50 L62 50 M50 8 L50 15 M50 85 L50 92 M8 50 L15 50 M85 50 L92 50 M21 21 L26 26 M74 74 L79 79 M79 21 L74 26 M21 79 L26 74"/>'],
    月: ['A crescent moon', '<path d="M60 10 A42 42 0 1 0 60 90 A55 55 0 0 1 60 10 Z"/>'],
    山: ['Three mountain peaks', '<path d="M8 86 L92 86 M14 86 L30 46 L42 70 L52 20 L64 70 L74 50 L86 86"/>'],
    木: ['A tree: branches above, roots below', '<path d="M50 8 L50 92 M18 36 L82 36 M50 36 L28 16 M50 36 L72 16 M50 62 L22 90 M50 62 L78 90"/>'],
    水: ['A stream with splashes on both sides', '<path d="M50 8 Q38 30 50 50 Q62 70 50 92 M22 28 Q32 40 26 54 M78 28 Q68 40 74 54 M24 66 Q32 76 28 88 M76 66 Q68 76 72 88"/>'],
    火: ['A flame with sparks flying out', '<path d="M50 10 C34 34 24 50 30 70 C36 90 64 90 70 70 C76 50 66 34 50 10 Z M50 54 C44 63 44 74 50 80 C56 74 56 63 50 54 Z M18 30 L26 42 M82 30 L74 42"/>'],
    门: ['A pair of swinging doors (the old form is 門)', '<path d="M14 92 L14 14 L44 14 L44 92 M56 92 L56 14 L86 14 L86 92 M37 50 L37 58 M63 50 L63 58"/>'],
    子: ['A baby in a wrap, waving its arms', '<circle cx="50" cy="20" r="12"/><path d="M14 44 Q50 36 86 44 M50 32 Q56 60 50 76 Q46 88 34 90"/>'],
    手: ['A hand with five fingers', '<path d="M26 52 L22 20 M38 50 L36 10 M50 50 L52 8 M62 52 L66 16 M68 64 L86 48 M26 52 Q48 46 66 54 Q72 64 68 76 Q62 92 46 92 Q30 90 26 52 Z"/>'],
    心: ['A heart — 心 means both heart and mind', '<path d="M50 86 C14 60 12 26 34 22 C44 20 50 28 50 36 C50 28 56 20 66 22 C88 26 86 60 50 86 Z"/>'],
    雨: ['Raindrops falling from the sky', '<path d="M12 12 L88 12 M50 12 L50 28 M18 28 L82 28 L82 92 M18 28 L18 92 M34 44 L34 52 M34 66 L34 74 M66 44 L66 52 M66 66 L66 74"/>'],
    车: ['A cart seen from above: two wheels on an axle (old form 車)', '<path d="M50 8 L50 92 M24 12 L76 12 M24 88 L76 88 M24 5 L24 19 M76 5 L76 19 M24 81 L24 95 M76 81 L76 95"/><rect x="32" y="36" width="36" height="28" rx="3"/>'],
    鱼: ['A fish: head, body and tail', '<path d="M10 50 Q40 18 70 50 Q40 82 10 50 Z M70 50 L92 30 L92 70 Z M40 38 Q47 50 40 62 M53 40 Q59 50 53 60"/><circle cx="24" cy="46" r="3"/>'],
    鸟: ['A bird: beak, eye, wing and feet', '<path d="M20 40 Q30 22 48 30 L60 36 Q84 40 92 62 Q70 58 60 64 Q44 76 30 64 Q22 56 20 40 Z M20 40 L6 44 L20 47 M44 67 L40 88 M54 67 L56 88"/><circle cx="31" cy="36" r="3"/>'],
    牛: ['An ox head with two horns', '<path d="M30 40 Q12 30 16 10 M70 40 Q88 30 84 10 M30 40 Q50 32 70 40 Q72 70 58 86 Q50 92 42 86 Q28 70 30 40 Z"/><circle cx="42" cy="54" r="3"/><circle cx="58" cy="54" r="3"/>'],
    羊: ['A sheep head — the two marks on top are its horns', '<path d="M36 34 Q22 30 22 12 Q36 14 40 26 M64 34 Q78 30 78 12 Q64 14 60 26 M36 34 Q50 28 64 34 Q66 62 56 82 Q50 90 44 82 Q34 62 36 34 Z"/><circle cx="44" cy="48" r="3"/><circle cx="56" cy="48" r="3"/>'],
    中: ['An arrow right through the middle of a target', '<rect x="20" y="34" width="60" height="32" rx="5"/><path d="M50 6 L50 94 M41 15 L50 6 L59 15"/>'],
    小: ['A tiny stroke with two little specks beside it — small', '<path d="M50 10 L50 78 Q50 90 38 86"/><circle cx="24" cy="46" r="4"/><circle cx="76" cy="46" r="4"/>'],
  };
  function pictoHTML(c) {
    const [cap, svg] = PICTO[c];
    return `<figure class="picto"><svg viewBox="0 0 100 100" aria-hidden="true">${svg}</svg><span class="arrow">→</span><span class="pc" lang="zh-Hans">${c}</span><figcaption>${esc(cap)}</figcaption></figure>`;
  }
  const picsFor = (it) => [...new Set([...it.hz])].filter((c) => PICTO[c]).map(pictoHTML).join('');

  // ---------- spaced repetition ----------
  function srsAnswer(it, ok) {
    const now = Date.now();
    const r = S.srs[it.id] || (S.srs[it.id] = { b: 0, due: 0, r: 0, w: 0 });
    if (ok) {
      r.r++;
      // Only promote when the word was new or actually due — practising early doesn't skip boxes.
      if (r.b === 0 || r.due <= now) { r.b = Math.min(r.b + 1, INTERVALS.length - 1); r.due = addDays(INTERVALS[r.b]); }
    } else { r.w++; r.b = 1; r.due = addDays(1); }
    r.t = now;
  }
  const dueList = () => {
    const now = Date.now();
    return Object.keys(S.srs).filter((id) => ITEMS[id] && S.srs[id].b > 0 && S.srs[id].due <= now)
      .sort((a, b) => S.srs[a].due - S.srs[b].due).map((id) => ITEMS[id]);
  };
  const learnedIn = (items) => items.filter((it) => S.srs[it.id] && S.srs[it.id].b > 0).length;
  const stage = (r) => (!r || !r.b ? 0 : r.b <= 2 ? 1 : r.b <= 4 ? 2 : 3);
  const STAGE_NAME = ['New', 'Learning', 'Familiar', 'Mastered'];
  function weakList() {
    return Object.keys(S.srs).filter((id) => ITEMS[id] && S.srs[id].w > 0 && S.srs[id].w / (S.srs[id].w + S.srs[id].r) >= 0.25)
      .sort((a, b) => (S.srs[b].w / (S.srs[b].w + S.srs[b].r)) - (S.srs[a].w / (S.srs[a].w + S.srs[a].r)) || S.srs[b].w - S.srs[a].w)
      .slice(0, 15).map((id) => ITEMS[id]);
  }
  function countAnswer() { const k = dayKey(); S.days[k] = (S.days[k] || 0) + 1; }
  function streakDays() {
    const met = (d) => (S.days[dayKey(d)] || 0) >= S.settings.dailyGoal;
    const d = new Date();
    if (!met(d)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (met(d)) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------- chrome, routing ----------
  let RUN = null, DRILL = null;
  const WORDS = { q: '', sec: 'all' };
  function render(html, tabs = true) {
    appEl.innerHTML = html;
    document.body.classList.toggle('in-run', !tabs);
    window.scrollTo(0, 0);
  }
  function header(title, back, right = '') {
    return `<header class="top">${back ? `<a class="back" href="${back}" aria-label="Back">‹</a>` : '<span></span>'}<h1>${title}</h1><div class="top-right">${right}</div></header>`;
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    const h = location.hash || '#/';
    if (h !== '#/run' && RUN) { clearTimeout(RUN.timer); RUN = null; }
    closeSheet();
    let m;
    if ((m = h.match(/^#\/s\/([\w-]+)$/))) renderSection(m[1]);
    else if ((m = h.match(/^#\/c\/([\w-]+)\/([\w-]+)$/))) renderChapter(m[1], m[2]);
    else if (h === '#/run') renderRun();
    else if (h === '#/review') renderReview();
    else if (h === '#/words') renderWords();
    else if (h === '#/settings') renderSettings();
    else if (h === '#/drill') renderDrill();
    else renderHome();
    updateTabs(h);
  }
  function updateTabs(h) {
    const tab = h.startsWith('#/review') ? 'review' : h.startsWith('#/words') ? 'words' : h.startsWith('#/settings') ? 'settings' : 'learn';
    document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    const due = dueList().length, badge = document.getElementById('due-badge');
    badge.textContent = due > 99 ? '99+' : due;
    badge.hidden = !due;
  }
  function applySettings() {
    document.body.classList.toggle('no-tones', !S.settings.toneColors);
    const root = document.documentElement;
    if (S.settings.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', S.settings.theme);
  }

  // ---------- home ----------
  function renderHome() {
    const due = dueList().length, goal = S.settings.dailyGoal, today = S.days[dayKey()] || 0;
    const learned = Object.values(S.srs).filter((r) => r.b > 0).length;
    render(`
      <section class="hero">
        <div class="seal" lang="zh-Hans">学</div>
        <div class="hero-zh">${hz('学中文', 'xué zhōng wén')}</div>
        <div class="hero-sub">Xué Zhōngwén · Learn Chinese</div>
      </section>
      ${installHint()}
      <section class="card stats">
        <div><b>🔥 ${streakDays()}</b><span>day streak</span></div>
        <div><b>${today}<small>/${goal}</small></b><span>today</span><i class="meter"><i style="width:${Math.min(100, pct(today, goal))}%"></i></i></div>
        <div><b>${learned}</b><span>learned</span></div>
      </section>
      ${reviewCta(due, learned)}
      ${continueCard()}
      <h2 class="h2">Sections</h2>
      ${SECTIONS.map(sectionCard).join('')}
      <p class="foot">Tap 🔊 to hear any word · tap a word to see its memory hook</p>`);
  }
  function installHint() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || navigator.standalone || S.settings.hideInstall) return '';
    return `<div class="card install"><span class="big-ico">📲</span><div><b>Install the app</b><br>Tap <b>Share</b> <span class="share">⬆︎</span> below, then <b>Add to Home Screen</b>.</div><button class="icon-btn" data-act="hide-install" aria-label="Hide">✕</button></div>`;
  }
  function reviewCta(due, learned) {
    if (!learned) return `<div class="card tip">👋 <b>Start here:</b> pick a section, open chapter 1 and do a run. Each word you answer joins your daily review. New to tones? Try the <a href="#/s/tones">Tones</a> section first.</div>`;
    if (due) return `<button class="card cta" data-act="review"><span class="cta-ico" lang="zh-Hans">复</span><span class="grow"><b>Review ${plural(due, 'word')}</b><small>Keep them in long-term memory</small></span><span class="chev">›</span></button>`;
    const next = Object.values(S.srs).filter((r) => r.b > 0).reduce((m, r) => Math.min(m, r.due), Infinity);
    return `<div class="card calm">✓ <b>All reviews done.</b> <small>Next review ${relDay(next)}.</small></div>`;
  }
  function continueCard() {
    let ch = S.last && chapterOf(S.last.sid, S.last.cid);
    if (!ch) return '';
    if (chState(ch).done) ch = SEC[ch.sid].chapters.find((c, i) => i > ch.index && !chState(c).done) || ch;
    const s = SEC[ch.sid];
    return `<a class="card cont" href="#/c/${ch.sid}/${ch.id}"><span class="big-ico">${s.icon}</span><span class="grow"><small>Continue</small><b>${esc(s.title)} › ${esc(ch.title)}</b><small>${learnedIn(ch.items)}/${ch.items.length} learned${chState(ch).done ? ' · ✓ complete' : ''}</small></span><span class="chev">›</span></a>`;
  }
  function sectionCard(s) {
    const done = s.chapters.filter((c) => chState(c).done).length;
    return `<a class="card sec" href="#/s/${s.id}">
      <span class="sec-icon">${s.icon}</span>
      <span class="grow">
        <span class="sec-title"><b>${esc(s.title)}</b> ${hz(s.zh, s.py)}</span>
        <span class="sec-desc">${esc(s.desc)}</span>
        <i class="meter"><i style="width:${pct(done, s.chapters.length)}%"></i></i>
        <span class="sec-meta">${done}/${s.chapters.length} chapters complete · ${learnedIn(s.all)}/${s.all.length} learned</span>
      </span><span class="chev">›</span></a>`;
  }

  // ---------- section & chapter ----------
  function renderSection(sid) {
    const s = SEC[sid];
    if (!s) return go('#/');
    const extra = sid === 'counting' ? drillCard() : sid === 'tones' ? tonesGuide() : '';
    const unit = sid === 'sentences' ? 'sentences' : sid === 'proverbs' ? 'sayings' : 'words';
    render(`${header(esc(s.title), '#/')}
      <div class="sec-head"><span class="big-ico">${s.icon}</span><div>${hz(s.zh, s.py, 'sec-zh')}<div>${py(s.py)}</div></div></div>
      <p class="muted">${esc(s.desc)}</p>
      ${extra}
      ${s.chapters.map((ch, i) => {
        const st = chState(ch);
        const stars = sid === 'tones' ? '' : `<span class="stars" title="English→中文 / 中文→English">${star(st.en2zh)}${star(st.zh2en)}</span>`;
        return `<a class="card chap ${st.done ? 'done' : ''}" href="#/c/${sid}/${ch.id}">
          <span class="chap-num">${st.done ? '✓' : i + 1}</span>
          <span class="grow"><b>${esc(ch.title)}</b> <span class="chap-zh" lang="zh-Hans">${esc(ch.zh)}</span>
          <small>${ch.items.length} ${unit} · ${learnedIn(ch.items)} learned</small></span>
          ${stars}<span class="chev">›</span></a>`;
      }).join('')}`);
  }
  const star = (on) => `<span class="star ${on ? 'on' : ''}">★</span>`;
  function drillCard() {
    return `<a class="card cta" href="#/drill"><span class="big-ico">🎲</span><span class="grow"><b>Number drill</b><small>Endless random numbers: read them, hear them, say them</small></span><span class="chev">›</span></a>`;
  }
  function tonesGuide() {
    const ex = [['妈', 'mā', 'mother'], ['麻', 'má', 'hemp'], ['马', 'mǎ', 'horse'], ['骂', 'mà', 'to scold']];
    return `<div class="card guide"><h3>The four tones</h3>
      <div class="tone-grid">${ex.map(([h, p, e], i) => `<button class="tone-cell" data-act="say" data-t="${h}">${contour(i + 1)}<span class="tc-hz">${hz(h, p)}</span>${py(p)}<small>${TONE_ORD[i + 1]} · ${TONE_NAME[i + 1]}<br>${e}</small></button>`).join('')}</div>
      <p><b>Neutral tone</b> — short and light, no mark: 妈妈 mā<span class="t5">ma</span>. Tap a tone to hear it.</p>
      <details><summary>When tones change</summary><ul>
        <li>Two 3rd tones in a row: the first becomes a 2nd. 你好 is written nǐ hǎo but said ní hǎo.</li>
        <li>不 bù becomes bú before a 4th tone: 不是 bú shì.</li>
        <li>一 yī becomes yí before a 4th tone (一个 yí ge) and yì before the others (一起 yì qǐ).</li>
        <li>In this app, 一 and 不 are written the way they are said.</li></ul></details></div>`;
  }
  function renderChapter(sid, cid) {
    const s = SEC[sid], ch = chapterOf(sid, cid);
    if (!ch) return go('#/');
    const st = chState(ch), modes = SECTION_MODES[sid], dir = S.settings.dirs[sid] || 'en2zh';
    const next = s.chapters[ch.index + 1];
    const status = st.done
      ? `<div class="banner good">✓ <b>Chapter complete</b>${sid !== 'tones' ? `<span class="dirstars">${star(st.en2zh)} English→中文 &nbsp; ${star(st.zh2en)} 中文→English</span>` : ''}</div>`
      : `<div class="banner">Finish one run with <b>no mistakes</b> to complete this chapter.${st.runs ? ` Best so far: ${plural(st.best, 'mistake')}.` : ''}</div>`;
    render(`${header(esc(ch.title), `#/s/${sid}`)}
      <div class="chap-head"><span lang="zh-Hans">${esc(ch.zh)}</span> · ${esc(s.title)} · chapter ${ch.index + 1} of ${s.chapters.length}</div>
      ${status}
      ${modes.some((m) => MODES[m].dirs) ? `<div class="seg">
        <button class="${dir === 'en2zh' ? 'on' : ''}" data-act="dir" data-sid="${sid}" data-dir="en2zh">English → 中文</button>
        <button class="${dir === 'zh2en' ? 'on' : ''}" data-act="dir" data-sid="${sid}" data-dir="zh2en">中文 → English</button></div>` : ''}
      <div class="modes">${modes.map((m) => modeBtn(m, sid, cid)).join('')}</div>
      <h2 class="h2">In this chapter <small>tap one to study it</small></h2>
      <div class="words">${ch.items.map(wordRow).join('')}</div>
      ${next ? `<a class="card next" href="#/c/${sid}/${next.id}"><span class="grow">Next chapter: <b>${esc(next.title)}</b></span><span class="chev">›</span></a>` : ''}`);
  }
  function modeBtn(m, sid, cid) {
    const M = MODES[m];
    const tag = M.dir === 'zh2en' ? '中→EN' : M.dir === 'en2zh' ? 'EN→中' : '';
    const noAudio = (m === 'listen' || m === 'tone') && !Speech.ok;
    return `<button class="mode" data-act="start" data-sid="${sid}" data-cid="${cid}" data-mode="${m}" ${noAudio ? 'disabled' : ''}>
      <span class="mode-icon">${M.icon}</span><span class="grow"><b>${M.name}</b><small>${noAudio ? 'Needs audio, which this browser lacks' : M.desc}</small></span>${tag ? `<span class="tag">${tag}</span>` : ''}</button>`;
  }
  function wordRow(it) {
    return `<button class="word" data-act="detail" data-id="${esc(it.id)}">
      <span class="w-img">${it.img || ''}</span>
      <span class="w-zh">${hz(it.h, it.p)}<small>${py(it.p)}</small></span>
      <span class="w-en">${esc(it.e)}</span>
      <span class="dot s${stage(S.srs[it.id])}" title="${STAGE_NAME[stage(S.srs[it.id])]}"></span></button>`;
  }

  // ---------- detail sheet ----------
  const block = (title, body) => `<div class="d-block"><h4>${title}</h4><div>${body}</div></div>`;
  function mwPhrase(it) {
    const [m, mp] = it.mw;
    const yi = [4, 5].includes(toneOf(mp)) ? 'yí' : 'yì';
    const h = '一' + m + it.hz, p = `${yi} ${mp} ${it.p}`;
    return `${hz(h, p)} ${py(p)} ${sayBtn(h)}`;
  }
  function openSheet(it) {
    if (!it) return;
    const r = S.srs[it.id];
    const status = !r ? 'New — not practised yet.'
      : `${STAGE_NAME[stage(r)]} · answered ${r.r + r.w}× (${r.r} right)${r.b ? ` · next review ${relDay(r.due)}` : ''}`;
    const pics = picsFor(it);
    const sheet = document.getElementById('sheet');
    sheet.innerHTML = `<div class="sheet-wrap" data-act="close-sheet"><div class="sheet" data-act="noop" role="dialog" aria-modal="true">
      <div class="grab"></div>
      <div class="d-top">
        ${it.img ? `<div class="d-img">${it.img}</div>` : ''}
        <div class="d-hz">${hz(it.h, it.p)}</div>
        <div class="d-py">${py(it.p)}</div>
        <div class="d-say">${sayBtn(it.hz, '🔊 Play')} ${slowBtn(it.hz, '🐢 Slow')}</div>
        <div class="d-en">${esc(it.e)}</div>
      </div>
      ${it.lit ? block('Literally', esc(it.lit)) : ''}
      ${it.eq ? block('In English we say', esc(it.eq)) : ''}
      ${pics ? block('Picture', `<div class="pics">${pics}</div>`) : ''}
      ${it.m ? block(it.sid === 'proverbs' ? '📜 Story' : '🧠 Memory hook', esc(it.m)) : ''}
      ${it.mw ? block('Measure word', mwPhrase(it)) : ''}
      ${it.x ? block('Example', `<div class="ex">${hz(it.x[0], it.x[1])} ${sayBtn(it.x[0])}<div>${py(it.x[1])}</div><div class="muted">${esc(it.x[2])}</div></div>`) : ''}
      ${it.n ? block('Note', esc(it.n)) : ''}
      <p class="d-status">${status}</p>
      <button class="btn wide" data-act="close-sheet">Close</button>
    </div></div>`;
    sheet.classList.add('open');
    document.body.classList.add('sheet-open');
    if (S.settings.autoplay) Speech.say(it.hz);
  }
  function closeSheet() {
    const sheet = document.getElementById('sheet');
    if (!sheet.classList.contains('open')) return;
    sheet.classList.remove('open'); sheet.innerHTML = '';
    document.body.classList.remove('sheet-open');
  }

  // ---------- runs (chapter runs, reviews, weak-word practice) ----------
  function startRun(kind, items, opts = {}) {
    if (!items.length) return;
    if (RUN) clearTimeout(RUN.timer);
    RUN = { kind, ...opts, queue: shuffle(items.slice()), total: items.length, done: new Set(), first: new Map(), mistakes: 0, missed: new Set(), finished: false };
    if (kind === 'chapter') { S.last = { sid: opts.sid, cid: opts.cid }; save(); }
    nextCard();
  }
  function reviewMode(it) {
    let m = SECTION_MODES[it.sid];
    if (!Speech.ok) m = m.filter((x) => x !== 'listen' && x !== 'tone');
    if (!m.length) m = ['choice'];
    const weight = { choice: 3, flash: 2 };
    return pick(m.flatMap((x) => Array(weight[x] || 1).fill(x)));
  }
  function nextCard() {
    clearTimeout(RUN.timer);
    if (!RUN.queue.length) return finishRun();
    const it = RUN.queue[0];
    const mode = RUN.kind === 'chapter' ? RUN.mode : reviewMode(it);
    const dir = MODES[mode].dir || (RUN.kind === 'chapter' ? RUN.dir : pick(['en2zh', 'zh2en']));
    const c = (RUN.cur = { it, mode, dir, state: 'ask' });
    if (mode === 'choice' || mode === 'listen') c.choices = makeChoices(it, mode === 'listen' ? 'zh2en' : dir);
    if (mode === 'tone') c.choices = toneChoices(it);
    if (mode === 'build') { c.pieces = pieces(it); c.pool = scrambled(c.pieces); c.built = []; }
    go('#/run');
    if (mode === 'listen' || mode === 'tone' || (dir === 'zh2en' && S.settings.autoplay)) Speech.say(it.hz);
  }
  function makeChoices(it, dir) {
    const key = (x) => (dir === 'zh2en' ? x.e.toLowerCase() : x.hz);
    const pool = shuffle(it.ch.items.filter((x) => x !== it)).concat(shuffle(SEC[it.sid].all.filter((x) => x.ch !== it.ch)));
    const out = [it], seen = new Set([key(it)]);
    for (const x of pool) {
      if (out.length >= 4) break;
      if (!seen.has(key(x))) { seen.add(key(x)); out.push(x); }
    }
    return shuffle(out);
  }
  function toneChoices(it) {
    const tones = tonesOf(it.p);
    if (tones.length === 1) return [[1], [2], [3], [4]];
    const key = (t) => t.join('-'), out = [tones], seen = new Set([key(tones)]);
    for (let g = 0; out.length < 4 && g < 200; g++) {
      const cand = tones.map((t, i) => (Math.random() < 0.6 ? 1 + Math.floor(Math.random() * (i ? 5 : 4)) : t));
      if (!seen.has(key(cand))) { seen.add(key(cand)); out.push(cand); }
    }
    return shuffle(out);
  }
  function pieces(it) {
    const han = align(it.h, it.p).filter((x) => x.t);
    let words = it.sid === 'sentences' ? it.h.split(' ').map((w) => [...w].filter(isHan).join('')).filter(Boolean) : [];
    if (words.length < 3) words = han.map((x) => x.c);
    let k = 0;
    return words.map((w) => { const seg = han.slice(k, k + w.length); k += w.length; return { t: w, p: seg.map((x) => x.s).join(' ') }; });
  }
  function scrambled(ps) {
    const idx = ps.map((_, i) => i), target = ps.map((x) => x.t).join('');
    for (let g = 0; g < 20; g++) { shuffle(idx); if (ps.length < 2 || idx.map((i) => ps[i].t).join('') !== target) break; }
    return idx;
  }

  // Records the answer. `settled` = the feedback is already on screen (a wrong written answer the
  // learner then confirmed or overruled), so move straight on.
  function answer(ok, settled) {
    const c = RUN && RUN.cur;
    if (!c || (c.state !== 'ask' && c.state !== 'checked')) return;
    const it = c.it;
    c.state = ok ? 'right' : 'wrong';
    RUN.queue.shift();
    countAnswer();
    if (!RUN.first.has(it.id)) { RUN.first.set(it.id, ok); srsAnswer(it, ok); }
    if (ok) RUN.done.add(it.id);
    else { RUN.mistakes++; RUN.missed.add(it.id); RUN.queue.splice(Math.min(RUN.queue.length, 3), 0, it); }
    save();
    if (settled) return nextCard();
    renderRun();
    if (S.settings.autoplay && c.dir === 'en2zh') Speech.say(it.hz);
    if (ok) {
      const wait = it.sid === 'sentences' || c.mode === 'flash' || c.mode === 'build' ? 1800 : 1200;
      RUN.timer = setTimeout(() => { if (RUN && RUN.cur === c) nextCard(); }, wait);
    }
  }
  function pickOpt(i) {
    const c = RUN && RUN.cur;
    if (!c || c.state !== 'ask') return;
    c.picked = i;
    answer(c.mode === 'tone' ? c.choices[i].join() === tonesOf(c.it.p).join() : c.choices[i] === c.it);
  }
  function tileTap(i) {
    const c = RUN.cur;
    if (c.state !== 'ask') return;
    c.built.push(c.pool.splice(i, 1)[0]);
    if (c.pool.length) return renderRun();
    answer(c.built.map((j) => c.pieces[j].t).join('') === c.pieces.map((x) => x.t).join(''));
  }
  function untile(i) {
    const c = RUN.cur;
    if (c.state !== 'ask') return;
    c.pool.push(c.built.splice(i, 1)[0]);
    renderRun();
  }
  function gradePinyin(input, it) {
    const inp = input.normalize('NFC').toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü');
    const inLetters = toneless([...inp].filter((c) => (c >= 'a' && c <= 'z') || c === 'ü' || MARKED.includes(c)).join(''));
    const inTones = [];
    for (const ch of inp) { const i = MARKED.indexOf(ch); if (i >= 0) inTones.push((i % 4) + 1); else if (/[1-4]/.test(ch)) inTones.push(+ch); }
    const han = align(it.h, it.p).filter((x) => x.t);
    const target = toneless(han.map((x) => x.s).join(''));
    if (inLetters !== target && inLetters !== target.replace(/ü/g, 'u')) return { ok: false, msg: 'not quite' };
    if (!inTones.length) return S.settings.strictTones ? { ok: false, msg: 'add the tones (1–4)' } : { ok: true, msg: 'right sounds! Now add the tones' };
    // Accept the spoken tones, or the dictionary tones for 一 / 不 / 个. Neutral syllables take no number.
    let seqs = [[]];
    for (const x of han) {
      const opts = new Set([x.t]);
      if (x.c === '一') opts.add(1);
      if (x.c === '不' || x.c === '个') opts.add(4);
      seqs = seqs.flatMap((sq) => [...opts].map((t) => (t === 5 ? sq : sq.concat(t))));
    }
    const hit = seqs.some((sq) => sq.length === inTones.length && sq.every((t, i) => t === inTones[i]));
    return hit ? { ok: true, msg: '' } : { ok: false, msg: 'right sounds, wrong tones' };
  }
  // ----- English answers: forgiving about typos, articles, "to", contractions and alternative meanings -----
  const CONTRACTIONS = [
    [/\bi'm\b/g, 'i am'], [/\b(you|we|they)'re\b/g, '$1 are'], [/\b(it|that|what|where|who|how|there|he|she)'s\b/g, '$1 is'],
    [/\bcan'?t\b|\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\b(\w+)n't\b/g, '$1 not'], [/\blet's\b/g, 'let us'],
    [/\b(i|you|we|they|he|she|it)'ll\b/g, '$1 will'], [/\b(i|you|we|they)'ve\b/g, '$1 have'], [/\b(i|you|we|they|he|she)'d\b/g, '$1 would'],
  ];
  const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'is', 'are', 'am', 'be', 'was', 'were', 'do', 'does', 'did', 'it', 'that', 'this', 'in', 'on', 'at', 'for', 'with', 'very', 'so', 'please', 'really']);
  function normEn(s) {
    let t = s.toLowerCase().replace(/[’‘]/g, "'").replace(/(\d),(\d)/g, '$1$2').replace(/colour/g, 'color').replace(/grey/g, 'gray');
    for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
    t = t.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t.replace(/^(to|a|an|the|one) (?=\S)/, '');
  }
  function lev(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function closeEnough(a, b) {
    if (a === b) return true;
    if (/\d/.test(a + b)) return false; // numbers must be exact
    if (a === `${b}s` || b === `${a}s`) return true; // "eats" for "eat", "cats" for "cat"
    const n = Math.max(a.length, b.length);
    return lev(a, b) <= (n <= 4 ? 0 : n <= 8 ? 1 : Math.floor(n * 0.15));
  }
  function enCandidates(it) {
    const words = it.sid !== 'sentences' && it.sid !== 'proverbs';
    const out = new Set([it.e, it.lit, it.eq].filter(Boolean));
    for (const sense of it.e.split(/\s*;\s*/)) {
      out.add(sense);
      if (!words) continue;
      sense.split(/\s*(?:\/|,(?!\d))\s*/).forEach((p) => out.add(p));
      // "to come / go in" → "to come in", "to go in"
      const m = sense.match(/^(.*?)(\S+) \/ (\S+)(.*)$/);
      if (m) { out.add(m[1] + m[2] + m[4]); out.add(m[1] + m[3] + m[4]); }
    }
    for (const p of [...out]) {
      out.add(p.replace(/\(.*?\)/g, ' '));
      if (words) (p.match(/\(([^)]*)\)/g) || []).forEach((m) => out.add(m.slice(1, -1)));
    }
    return [...out].map(normEn).filter(Boolean);
  }
  function gradeEnglish(input, it) {
    const inp = normEn(input);
    if (!inp) return { ok: false, msg: 'not quite' };
    const cands = enCandidates(it);
    if (cands.some((c) => closeEnough(inp, c))) return { ok: true, msg: cands.includes(inp) ? '' : 'close enough' };
    // Longer answers (sentences, sayings): enough of the meaningful words, without much extra.
    const mine = inp.split(' ').filter((w) => !STOP.has(w));
    for (const c of cands) {
      const theirs = c.split(' ').filter((w) => !STOP.has(w));
      if (theirs.length < 3) continue;
      const used = new Set();
      let hit = 0;
      for (const w of theirs) {
        const j = mine.findIndex((x, k) => !used.has(k) && closeEnough(x, w));
        if (j >= 0) { used.add(j); hit++; }
      }
      if ((hit - 0.5 * (mine.length - used.size)) / theirs.length >= 0.75) return { ok: true, msg: 'close enough' };
    }
    return { ok: false, msg: 'not quite' };
  }
  const hanOnly = (s) => [...s].filter(isHan).join('');
  function gradeWrite(input, it, dir) {
    if (dir === 'zh2en') return gradeEnglish(input, it);
    if ([...input].some(isHan)) {
      const ok = hanOnly(input) === hanOnly(it.hz);
      return { ok, msg: ok ? '' : 'different characters' };
    }
    return gradePinyin(input, it);
  }
  function checkWrite(giveUp) {
    const c = RUN && RUN.cur;
    if (!c || c.state !== 'ask') return;
    const typed = giveUp ? '' : ((document.getElementById('typed') || {}).value || '').trim();
    if (!giveUp && !typed) return;
    if (giveUp) { c.note = ''; return answer(false); }
    const res = gradeWrite(typed, c.it, c.dir);
    c.typed = typed;
    c.note = `You wrote <b>${esc(typed)}</b>${res.msg ? ` — ${res.msg}` : ''}`;
    if (res.ok) return answer(true);
    // Wrong: show the answer first, and let the learner overrule if theirs meant the same.
    c.state = 'checked';
    renderRun();
    if (S.settings.autoplay && c.dir === 'en2zh') Speech.say(c.it.hz);
  }

  function finishRun() {
    RUN.finished = true;
    RUN.perfect = RUN.mistakes === 0;
    if (RUN.kind === 'chapter') {
      const key = `${RUN.sid}/${RUN.cid}`;
      const st = (S.chapters[key] = S.chapters[key] || { done: false, en2zh: false, zh2en: false, runs: 0, best: null });
      RUN.wasDone = st.done;
      st.runs++;
      st.best = st.best == null ? RUN.mistakes : Math.min(st.best, RUN.mistakes);
      if (RUN.perfect) {
        st.done = true;
        const d = MODES[RUN.mode].dir || RUN.dir;
        if (d === 'en2zh' || d === 'zh2en') { RUN.newStar = !st[d]; st[d] = true; }
      }
    }
    save();
    go('#/run');
  }
  function quitRun() {
    if (RUN && !RUN.finished && RUN.done.size > 0 && !confirm('Quit this run? Your answers so far are saved for review, but the chapter run ends.')) return;
    const back = RUN && RUN.kind === 'chapter' ? `#/c/${RUN.sid}/${RUN.cid}` : '#/review';
    go(back);
  }

  // ---------- run rendering ----------
  function sizeClass(s) { const n = [...s].filter(isHan).length; return n <= 2 ? 'xl' : n <= 4 ? 'l' : n <= 8 ? 'm' : 's'; }
  const promptEn = (it) => `<div class="q">${it.img ? `<div class="q-img">${it.img}</div>` : ''}<div class="q-en">${esc(it.e)}</div></div>`;
  const promptZh = (it) => `<div class="q"><div class="q-hz ${sizeClass(it.hz)}">${hz(it.h, it.p)}</div>${S.settings.showPinyin ? `<div class="q-py">${py(it.p)}</div>` : ''}<div class="q-say">${sayBtn(it.hz)}${slowBtn(it.hz)}</div></div>`;
  function listenPrompt(it, revealed, question) {
    return `<div class="q"><div class="q-say big">${sayBtn(it.hz, '🔊', 'big-say')}${slowBtn(it.hz, '🐢')}</div>
      <div class="q-hint">${revealed ? `${hz(it.h, it.p)} ${py(it.p)}` : question}</div></div>`;
  }
  function reveal(it) {
    const extra = it.sid === 'proverbs'
      ? `${it.lit ? `<div class="r-hook">📜 Literally: ${esc(it.lit)}</div>` : ''}${it.eq ? `<div class="r-hook">🇬🇧 ${esc(it.eq)}</div>` : ''}`
      : `${it.m ? `<div class="r-hook">🧠 ${esc(it.m)}</div>` : ''}${it.n ? `<div class="r-hook">💡 ${esc(it.n)}</div>` : ''}`;
    return `<div class="reveal">
      <div class="r-main">${it.img ? `<span class="r-img">${it.img}</span>` : ''}<div class="grow">
        <div class="r-hz">${hz(it.h, it.p)} ${sayBtn(it.hz)}</div><div class="r-py">${py(it.p)}</div><div class="r-en">${esc(it.e)}</div></div></div>
      ${extra}
      <button class="link" data-act="detail" data-id="${esc(it.id)}">More about this ›</button></div>`;
  }
  function feedback(c) {
    const ok = c.state === 'right';
    const overrule = c.state === 'checked' ? '<div class="fb-note muted">Did yours mean the same thing? Then tap “I was right”.</div>' : '';
    return `<div class="fb ${ok ? 'good' : 'bad'}"><div class="fb-title">${ok ? pick(PRAISE) : '✗ Not quite — remember this one:'}</div>${c.note ? `<div class="fb-note">${c.note}</div>` : ''}${overrule}${reveal(c.it)}</div>`;
  }
  const continueBtn = () => `<button class="btn primary wide" data-act="next">Continue</button>`;
  const tileHTML = (piece, attrs) => `<button class="tile" ${attrs}>${hz(piece.t, piece.p)}${S.settings.showPinyin ? `<small>${py(piece.p)}</small>` : ''}</button>`;
  function toneLabel(ts) {
    return ts.map((t) => `<span class="tl t${t}">${contour(t)}<b>${t === 5 ? '·' : t}</b>${ts.length === 1 ? `<small>${TONE_NAME[t]}</small>` : ''}</span>`).join('<span class="plus">+</span>');
  }
  function runLabel(c) {
    const M = MODES[c.mode];
    const d = c.dir === 'en2zh' ? 'English → 中文' : c.dir === 'zh2en' ? '中文 → English' : '';
    const where = RUN.kind === 'chapter' ? '' : `${SEC[c.it.sid].icon} ${esc(SEC[c.it.sid].title)} · `;
    return `${where}${M.icon} ${M.name}${d && c.mode !== 'listen' ? ` · ${d}` : ''}`;
  }

  function renderRun() {
    if (!RUN) return go('#/');
    if (RUN.finished) return renderResult();
    const c = RUN.cur, it = c.it, asking = c.state === 'ask';
    let body = '', foot = '';
    if (c.mode === 'flash') {
      const toEn = c.dir === 'zh2en';
      body = `<div class="card qcard">${toEn ? promptZh(it) : promptEn(it)}</div>`;
      if (asking) {
        const attrs = toEn ? 'autocorrect="on" spellcheck="true" placeholder="The meaning in English"' : 'autocorrect="off" spellcheck="false" placeholder="Pinyin (ni3 hao3) or 汉字"';
        body += `<form class="type-form" data-form="write"><input id="typed" autocomplete="off" autocapitalize="off" enterkeyhint="done" ${attrs}>
          ${toEn ? '<p class="hint">Small typos are fine.</p>'
            : `<div class="tone-keys">${[1, 2, 3, 4].map((n) => `<button type="button" class="tk t${n}" data-act="tk" data-n="${n}">${n}${contour(n)}</button>`).join('')}</div>
          <p class="hint">Pinyin: put the tone number after each syllable (ü = v). For 汉字, switch to the Chinese keyboard with 🌐.</p>`}</form>`;
        foot = `<div class="row2"><button class="btn" data-act="dunno">Show me</button><button class="btn primary" data-act="check-write">Check</button></div>`;
      } else if (c.state === 'checked') {
        body += feedback(c);
        foot = `<div class="row2"><button class="btn" data-act="overrule">✓ I was right</button><button class="btn primary" data-act="confirm-wrong">Continue</button></div>`;
      } else { body += feedback(c); foot = continueBtn(); }
    } else if (c.mode === 'choice' || c.mode === 'listen' || c.mode === 'tone') {
      const showEn = c.mode === 'listen' || c.dir === 'zh2en';
      const q = c.mode === 'tone' ? listenPrompt(it, !asking, 'Which tone do you hear?')
        : c.mode === 'listen' ? listenPrompt(it, !asking, 'What does it mean?')
        : c.dir === 'en2zh' ? promptEn(it) : promptZh(it);
      const right = c.mode === 'tone' ? tonesOf(it.p).join() : null;
      const opts = c.choices.map((x, i) => {
        const isRight = c.mode === 'tone' ? x.join() === right : x === it;
        const cls = asking ? '' : isRight ? 'right' : i === c.picked ? 'wrong' : 'dim';
        const label = c.mode === 'tone' ? toneLabel(x)
          : showEn ? `<span class="o-en">${esc(x.e)}</span>`
          : `${hz(x.h, x.p)}${S.settings.showPinyin ? `<small>${py(x.p)}</small>` : ''}`;
        return `<button class="opt ${cls}" data-act="pick" data-i="${i}">${label}</button>`;
      }).join('');
      const long = !showEn && c.mode !== 'tone' && c.choices.some((x) => x.hz.length > 5);
      const layout = c.mode === 'tone' ? 'tones' : showEn ? 'en' : long ? 'zh long' : 'zh';
      body = `<div class="card qcard">${q}</div><div class="opts ${layout}">${opts}</div>${asking ? '' : feedback(c)}`;
      foot = asking ? '' : continueBtn();
    } else if (c.mode === 'build') {
      body = `<div class="card qcard">${promptEn(it)}</div>
        <div class="build-ans ${asking ? '' : c.state}">${c.built.map((j, k) => tileHTML(c.pieces[j], `data-act="untile" data-i="${k}"`)).join('') || '<span class="ph">Tap the pieces in order…</span>'}</div>
        <div class="build-pool">${c.pool.map((j, k) => tileHTML(c.pieces[j], `data-act="tile" data-i="${k}"`)).join('')}</div>
        ${asking ? '' : feedback(c)}`;
      foot = asking ? (c.built.length ? `<button class="btn wide" data-act="build-reset">Start over</button>` : '') : continueBtn();
    }
    const score = RUN.mistakes ? `<span class="miss">✗ ${RUN.mistakes}</span>` : `<span class="clean">✓</span>`;
    render(`<div class="run">
      <div class="run-top"><button class="icon-btn" data-act="quit" aria-label="Quit">✕</button>
        <i class="meter run-meter"><i style="width:${pct(RUN.done.size, RUN.total)}%"></i></i>
        <span class="run-count">${RUN.done.size}/${RUN.total} ${score}</span></div>
      <div class="run-label">${runLabel(c)}</div>
      <div class="run-body">${body}</div>
      <div class="run-foot">${foot}</div></div>`, false);
    if (c.mode === 'flash' && asking) { const inp = document.getElementById('typed'); if (inp) inp.focus(); }
  }
  function renderResult() {
    const R = RUN, missed = [...R.missed].map((id) => ITEMS[id]).filter(Boolean);
    let emoji, title, sub, buttons;
    if (R.kind === 'chapter') {
      const s = SEC[R.sid], ch = chapterOf(R.sid, R.cid), next = s.chapters[ch.index + 1];
      if (R.perfect) {
        emoji = '🎉'; title = R.wasDone ? 'Perfect again!' : 'Chapter complete!';
        sub = `${esc(ch.title)} — every answer right.${R.newStar ? ' You earned a new ★.' : ''}`;
        buttons = `${next ? `<a class="btn primary wide" href="#/c/${R.sid}/${next.id}">Next chapter: ${esc(next.title)} ›</a>` : ''}
          <div class="row2"><button class="btn" data-act="retry">Run again</button><a class="btn" href="#/c/${R.sid}/${R.cid}">Back to chapter</a></div>`;
      } else {
        emoji = '💪'; title = `${plural(R.mistakes, 'mistake')} this time`;
        sub = 'Do a run with no mistakes to complete the chapter. Have another look at these:';
        buttons = `<button class="btn primary wide" data-act="retry">Try again</button><a class="btn wide" href="#/c/${R.sid}/${R.cid}">Back to chapter</a>`;
      }
    } else {
      const firstOk = [...R.first.values()].filter(Boolean).length, due = dueList().length;
      emoji = R.perfect ? '🌟' : '✅'; title = R.kind === 'weak' ? 'Practice done' : 'Review done';
      sub = `${firstOk}/${R.total} right on the first try.`;
      buttons = `${due ? `<button class="btn primary wide" data-act="review">Keep reviewing (${due} due)</button>` : ''}<a class="btn wide" href="#/">Done</a>`;
    }
    const confetti = R.perfect ? `<div class="confetti">${Array.from({ length: 36 }, () => `<i style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * 0.9).toFixed(2)}s;background:hsl(${Math.floor(Math.random() * 360)} 85% 60%)"></i>`).join('')}</div>` : '';
    render(`<div class="run result">${confetti}
      <div class="res-emoji">${emoji}</div><h2>${title}</h2><p class="muted">${sub}</p>
      ${missed.length ? `<h2 class="h2">Missed this time · tap to study</h2><div class="words">${missed.map(wordRow).join('')}</div>` : ''}
      <div class="res-buttons">${buttons}</div></div>`, false);
  }

  // ---------- review tab ----------
  function renderReview() {
    const due = dueList(), weak = weakList();
    const known = Object.keys(S.srs).filter((id) => ITEMS[id] && S.srs[id].b > 0);
    const counts = [0, 0, 0, 0];
    known.forEach((id) => counts[stage(S.srs[id])]++);
    const soon = (n) => known.filter((id) => S.srs[id].due < addDays(n + 1)).length;
    render(`${header('Review', null)}
      <div class="card review-big">
        <div class="rb-num">${due.length}</div><div>${due.length === 1 ? 'word' : 'words'} due now</div>
        ${due.length ? `<button class="btn primary wide" data-act="review">Start review${due.length > REVIEW_SIZE ? ` (${REVIEW_SIZE} at a time)` : ''}</button>`
          : `<p class="muted">${known.length ? 'All caught up! New reviews appear here each morning.' : 'Do a chapter run first — every word you answer joins your review.'}</p>`}
      </div>
      ${weak.length ? `<button class="card cta" data-act="weak"><span class="big-ico">🎯</span><span class="grow"><b>Practise weak words</b><small>${plural(weak.length, 'word')} you miss most often</small></span><span class="chev">›</span></button>` : ''}
      ${known.length ? `<div class="card"><h3>Your words</h3>
        <div class="stack">${[1, 2, 3].map((s) => `<i class="s${s}" style="flex:${counts[s] || 0}"></i>`).join('')}</div>
        <div class="legend">${[1, 2, 3].map((s) => `<span><i class="dot s${s}"></i>${STAGE_NAME[s]} ${counts[s]}</span>`).join('')}</div>
        <p class="muted">Coming up: ${soon(1) - due.length} tomorrow · ${soon(7) - due.length} in the next 7 days</p></div>` : ''}
      <div class="card"><h3>How review works</h3><p class="muted">Every word you answer goes into a box. Each time you get it right on its review day, it moves up a box and waits longer: 1 → 2 → 4 → 8 → 16 → 32 days and beyond. Miss it and it comes back tomorrow. A few minutes a day keeps everything fresh.</p></div>`);
  }

  // ---------- words tab ----------
  function renderWords() {
    render(`${header('Words', null)}
      <input id="q" class="search" type="search" placeholder="Search English, pinyin or 汉字" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" value="${esc(WORDS.q)}">
      <div class="chips">${['all', ...SECTIONS.map((s) => s.id)].map((id) => `<button class="chip ${WORDS.sec === id ? 'on' : ''}" data-act="wsec" data-id="${id}">${id === 'all' ? 'All' : `${SEC[id].icon} ${esc(SEC[id].title)}`}</button>`).join('')}</div>
      <p class="muted small" id="wcount"></p>
      <div id="wlist" class="words"></div>`);
    fillWords();
    document.getElementById('q').addEventListener('input', (e) => { WORDS.q = e.target.value; fillWords(); });
  }
  function fillWords() {
    const raw = WORDS.q.trim(), q = raw.toLowerCase(), qn = toneless(q).replace(/[\s'0-9]/g, '');
    let list = WORDS.sec === 'all' ? SECTIONS.flatMap((s) => s.all) : SEC[WORDS.sec].all;
    if (q) list = list.filter((it) => it.e.toLowerCase().includes(q) || it.hz.includes(raw) || (qn && toneless(it.p.toLowerCase()).replace(/[\s'.,?!]/g, '').includes(qn)));
    document.getElementById('wcount').textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
    document.getElementById('wlist').innerHTML = list.slice(0, 400).map(wordRow).join('') || '<p class="muted">No matches.</p>';
  }

  // ---------- settings ----------
  function renderSettings() {
    const st = S.settings;
    const voice = !Speech.ok ? 'Not supported in this browser' : Speech.voice ? `${esc(Speech.voice.name)} (${esc(Speech.voice.lang)})` : 'No Chinese voice found';
    const toggle = (key, title, desc) => `<label class="set-row"><span class="grow"><b>${title}</b><small>${desc}</small></span><input type="checkbox" class="switch" data-set="${key}" ${st[key] ? 'checked' : ''}></label>`;
    render(`${header('Settings', null)}
      <div class="card set">
        ${toggle('toneColors', 'Tone colors', 'Color hanzi and pinyin by tone')}
        <div class="legend tones-legend">${[1, 2, 3, 4, 5].map((t) => `<span class="t${t}">${contour(t)} ${TONE_ORD[t]}</span>`).join('')}</div>
        ${toggle('showPinyin', 'Show pinyin in questions', 'Turn off to practise reading hanzi on their own')}
        ${toggle('autoplay', 'Play audio automatically', 'Speak the Chinese when a card is shown or answered')}
        <label class="set-row"><span class="grow"><b>Speech speed</b><small id="rate-val">${st.rate.toFixed(2)}×</small></span><input type="range" min="0.5" max="1.1" step="0.05" value="${st.rate}" data-set="rate"></label>
        <div class="set-row"><span class="grow"><b>Voice</b><small>${voice}</small></span><button class="btn small" data-act="say" data-t="你好，欢迎你学中文！">Test</button></div>
        ${Speech.ok && !Speech.voice ? '<p class="hint">On iPhone: Settings → Accessibility → Spoken Content → Voices → Chinese → download a voice such as Tingting.</p>' : ''}
      </div>
      <div class="card set">
        ${toggle('strictTones', 'Require tones when typing', 'When off, “nihao” counts as right, with a reminder')}
        <label class="set-row"><span class="grow"><b>Daily goal</b><small>Answers per day that count toward your streak</small></span>
          <select data-set="dailyGoal">${[10, 20, 30, 50, 100].map((n) => `<option value="${n}" ${st.dailyGoal === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="set-row"><span class="grow"><b>Appearance</b></span>
          <select data-set="theme">${[['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${st.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="card set">
        <h3>Backup</h3>
        <p class="muted">Progress is saved on this phone. Save a backup now and then (for example to Files or iCloud Drive) so you can restore it on a new phone.</p>
        <div class="row2"><button class="btn" data-act="export">Save backup</button><label class="btn">Restore<input type="file" accept=".json,application/json" data-set="import" hidden></label></div>
        <button class="btn danger wide" data-act="reset">Reset all progress</button>
      </div>
      <div class="card set">
        <h3>Install on iPhone</h3>
        <ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button <span class="share">⬆︎</span>.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
        <p class="muted">It then opens full screen from its own icon and works offline.</p>
      </div>
      <p class="foot">学中文 v${APP_VERSION} · ${Object.keys(ITEMS).length} words &amp; phrases</p>`);
  }
  function exportProgress() {
    const data = JSON.stringify({ app: 'xuezhongwen', version: 1, exported: new Date().toISOString(), state: S });
    const name = `xuezhongwen-backup-${dayKey()}.json`;
    const blob = new Blob([data], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: '学中文 backup' }).catch(() => {}); return; }
    } catch (e) { /* fall back to a download link */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result), st = obj.state || obj;
        if (!st || typeof st.srs !== 'object') throw new Error('not a backup');
        if (!confirm('Replace your current progress with this backup?')) return;
        S = { ...freshState(), ...st, settings: { ...DEFAULT_SETTINGS, ...(st.settings || {}) } };
        save(); applySettings(); toast('✓ Backup restored'); route();
      } catch (e) { toast('That file is not a 学中文 backup'); }
    };
    reader.readAsText(file);
  }

  // ---------- number drill ----------
  const DIG = '零一二三四五六七八九';
  const NUM_PY = { 零: 'líng', 一: 'yī', 二: 'èr', 两: 'liǎng', 三: 'sān', 四: 'sì', 五: 'wǔ', 六: 'liù', 七: 'qī', 八: 'bā', 九: 'jiǔ', 十: 'shí', 百: 'bǎi', 千: 'qiān', 万: 'wàn' };
  function zh4(x, lead) { // 0 < x < 10000
    const d = [Math.floor(x / 1000), Math.floor(x / 100) % 10, Math.floor(x / 10) % 10, x % 10], U = ['千', '百', '十', ''];
    let s = '', zero = false, started = false;
    for (let i = 0; i < 4; i++) {
      if (!d[i]) { if (started) zero = true; continue; }
      if (zero) { s += '零'; zero = false; }
      s += (d[i] === 2 && i < 2 && !started ? '两' : DIG[d[i]]) + U[i];
      started = true;
    }
    return lead && s.startsWith('一十') ? s.slice(1) : s;
  }
  function numZh(n) {
    if (n === 0) return '零';
    if (n < 10000) return zh4(n, true);
    const hi = Math.floor(n / 10000), lo = n % 10000;
    let s = (hi === 2 ? '两' : zh4(hi, true)) + '万';
    if (lo) s += (lo < 1000 ? '零' : '') + zh4(lo, false);
    return s;
  }
  function numPy(zh) {
    const cs = [...zh];
    return cs.map((c, i) => (c === '一' && (cs[i + 1] === '百' || cs[i + 1] === '千') ? 'yì' : c === '一' && cs[i + 1] === '万' ? 'yí' : NUM_PY[c])).join(' ');
  }
  const DRILL_RANGES = [[10, '0–10'], [99, '0–99'], [999, '0–999'], [9999, '0–9,999'], [99999999, 'Huge']];
  const DRILL_MODES = [['read', '👀 Read'], ['listen', '👂 Listen'], ['say', '🗣️ Say']];
  function newDrill() {
    const max = DRILL.max;
    DRILL.n = max > 99999 ? Math.floor(10 ** (4 + Math.random() * 4)) : Math.floor(Math.random() * (max + 1));
    DRILL.state = 'ask'; DRILL.typed = '';
  }
  function renderDrill() {
    if (!DRILL) { DRILL = { max: 99, mode: 'read', streak: 0 }; newDrill(); }
    const D = DRILL, zh = numZh(D.n), p = numPy(zh), asking = D.state === 'ask';
    const digits = D.n.toLocaleString('en-US');
    let q = '', foot = '';
    if (D.mode === 'read') q = `<div class="q-hz ${sizeClass(zh)}">${hz(zh, p)}</div>${asking ? '' : `<div class="q-py">${py(p)}</div>`}`;
    else if (D.mode === 'listen') q = `<div class="q-say big">${sayBtn(zh, '🔊', 'big-say')}${slowBtn(zh)}</div>${asking ? '<div class="q-hint">Type the number you hear</div>' : `<div class="q-hz m">${hz(zh, p)}</div><div class="q-py">${py(p)}</div>`}`;
    else q = `<div class="q-num">${digits}</div>${asking ? '<div class="q-hint">Say it out loud in Chinese, then check</div>' : `<div class="q-hz m">${hz(zh, p)}</div><div class="q-py">${py(p)}</div>`}`;
    let fb = '';
    if (asking && D.mode !== 'say') {
      fb = `<form class="type-form" data-form="drill"><input id="dn" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Type the number" enterkeyhint="done"></form>`;
      foot = `<button class="btn primary wide" data-act="drill-check">Check</button>`;
    } else if (asking) {
      foot = `<button class="btn primary wide" data-act="drill-show">Show answer</button>`;
    } else if (D.mode === 'say' && D.state === 'shown') {
      fb = `<div class="fb">${sayBtn(zh, '🔊 Hear it again')}</div>`;
      foot = `<div class="row2"><button class="btn bad" data-act="drill-grade" data-ok="0">✗ Got it wrong</button><button class="btn good" data-act="drill-grade" data-ok="1">✓ Said it right</button></div>`;
    } else {
      fb = `<div class="fb ${D.state === 'right' ? 'good' : 'bad'}"><div class="fb-title">${D.state === 'right' ? pick(PRAISE) : `✗ It was ${digits}`}</div>${D.typed && D.state !== 'right' ? `<div class="fb-note">You typed ${esc(D.typed)}</div>` : ''}</div>`;
      foot = `<button class="btn primary wide" data-act="drill-next">Next number</button>`;
    }
    render(`${header('Number drill', '#/s/counting')}
      <div class="chips">${DRILL_RANGES.map(([m, l]) => `<button class="chip ${D.max === m ? 'on' : ''}" data-act="drill-range" data-v="${m}">${l}</button>`).join('')}</div>
      <div class="seg">${DRILL_MODES.map(([m, l]) => `<button class="${D.mode === m ? 'on' : ''}" data-act="drill-mode" data-v="${m}">${l}</button>`).join('')}</div>
      <div class="card qcard"><div class="q">${q}</div></div>
      ${fb}
      <p class="muted center">In a row: <b>${D.streak}</b> · best: <b>${S.drillBest || 0}</b></p>
      <div class="drill-foot">${foot}</div>`);
    if (asking && D.mode !== 'say') { const i = document.getElementById('dn'); if (i) i.focus(); }
  }
  function drillResult(ok) {
    const D = DRILL;
    D.state = ok ? 'right' : 'wrong';
    D.streak = ok ? D.streak + 1 : 0;
    if (D.streak > (S.drillBest || 0)) S.drillBest = D.streak;
    countAnswer(); save(); renderDrill();
    if (D.mode === 'read' && S.settings.autoplay) Speech.say(numZh(D.n));
  }
  function drillNext() { newDrill(); renderDrill(); if (DRILL.mode === 'listen') Speech.say(numZh(DRILL.n)); }

  // ---------- events ----------
  const ACTIONS = {
    say: (el) => Speech.say(el.dataset.t, !!el.dataset.slow),
    detail: (el) => { if (RUN) clearTimeout(RUN.timer); openSheet(ITEMS[el.dataset.id]); },
    'close-sheet': closeSheet,
    noop: () => {},
    'hide-install': () => { S.settings.hideInstall = true; save(); route(); },
    dir: (el) => {
      S.settings.dirs[el.dataset.sid] = el.dataset.dir; save();
      el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
    },
    start: (el) => {
      const ch = chapterOf(el.dataset.sid, el.dataset.cid), mode = el.dataset.mode;
      startRun('chapter', ch.items, { sid: ch.sid, cid: ch.id, mode, dir: MODES[mode].dir || S.settings.dirs[ch.sid] || 'en2zh' });
    },
    retry: () => { const R = RUN; startRun('chapter', chapterOf(R.sid, R.cid).items, { sid: R.sid, cid: R.cid, mode: R.mode, dir: R.dir }); },
    review: () => startRun('review', dueList().slice(0, REVIEW_SIZE)),
    weak: () => startRun('weak', weakList()),
    quit: quitRun,
    overrule: () => answer(true, true),
    'confirm-wrong': () => answer(false, true),
    pick: (el) => pickOpt(+el.dataset.i),
    next: () => { if (RUN && !RUN.finished) nextCard(); },
    tile: (el) => tileTap(+el.dataset.i),
    untile: (el) => untile(+el.dataset.i),
    'build-reset': () => { const c = RUN.cur; c.pool = c.pool.concat(c.built); c.built = []; renderRun(); },
    tk: (el) => { const i = document.getElementById('typed'); if (i) { i.value += el.dataset.n; i.focus(); } },
    'check-write': () => checkWrite(false),
    dunno: () => checkWrite(true),
    wsec: (el) => { WORDS.sec = el.dataset.id; renderWords(); },
    export: exportProgress,
    reset: () => {
      if (!confirm('Reset ALL progress? Completed chapters, reviews and streak will be erased. This cannot be undone.')) return;
      S = { ...freshState(), settings: S.settings }; save(); toast('Progress reset'); go('#/');
    },
    'drill-range': (el) => { DRILL.max = +el.dataset.v; DRILL.streak = 0; drillNext(); },
    'drill-mode': (el) => { DRILL.mode = el.dataset.v; DRILL.streak = 0; drillNext(); },
    'drill-check': () => {
      const v = ((document.getElementById('dn') || {}).value || '').replace(/[^0-9]/g, '');
      if (!v) return;
      DRILL.typed = v; drillResult(+v === DRILL.n);
    },
    'drill-show': () => { DRILL.state = 'shown'; renderDrill(); Speech.say(numZh(DRILL.n)); },
    'drill-grade': (el) => drillResult(el.dataset.ok === '1'),
    'drill-next': drillNext,
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.dataset.form === 'write') checkWrite(false);
    if (e.target.dataset.form === 'drill') ACTIONS['drill-check']();
  });
  document.addEventListener('change', (e) => {
    const el = e.target, key = el.dataset.set;
    if (!key) return;
    if (key === 'import') { if (el.files[0]) importProgress(el.files[0]); el.value = ''; return; }
    S.settings[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : key === 'dailyGoal' ? +el.value : el.value;
    save(); applySettings();
  });
  document.addEventListener('input', (e) => {
    if (e.target.dataset.set === 'rate') document.getElementById('rate-val').textContent = `${(+e.target.value).toFixed(2)}×`;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  ['touchend', 'click'].forEach((ev) => document.addEventListener(ev, Speech.unlock, { once: true, capture: true }));
  window.addEventListener('hashchange', route);

  // ---------- start ----------
  Speech.init();
  applySettings();
  if (!SECTIONS.length) appEl.innerHTML = '<p style="padding:24px">Content failed to load. Please reload.</p>';
  else route();

  // Offline cache; skipped on localhost during development unless the URL has ?sw=1.
  const devHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !devHost) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('✓ App updated — close and reopen it to see what’s new'); });
  }

  // Exposed for debugging and tests only.
  window.XZW = { numZh, numPy, gradePinyin, gradeWrite, align, state: () => S, run: () => RUN, ITEMS, PICTO, pictoHTML };
})();
