// ── Constants ──────────────────────────────────────────────────────────────
const WORDS_URL   = 'data/words.json';
const START_DATE  = new Date('2025-05-14');
const STORE_GAME  = 'nevordl_game';
const STORE_STATS = 'nevordl_stats';
const MAX_GUESSES = 6;
const WORD_LEN    = 5;
const UNDOS_NORMAL = 5;
const UNDOS_HARD   = 2;

const KB_ROWS = [
  ['й','ц','у','к','е','н','г','ш','щ','з','х','ъ'],
  ['ф','ы','в','а','п','р','о','л','д','ж','э','ё'],
  ['ВВОД','я','ч','с','м','и','т','ь','б','ю','⌫'],
];

// ── State ──────────────────────────────────────────────────────────────────
let words = [];        // shuffled word list
let wordSet = null;    // Set for O(1) lookup
let state  = null;

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  const raw = await fetch(WORDS_URL).then(r => r.json());
  words   = deterministicShuffle(raw, 1337);
  wordSet = new Set(words);

  buildBoard();
  buildKeyboard();
  loadState();
  bindEvents();
  render();
}

// ── Puzzle index ───────────────────────────────────────────────────────────
function puzzleIndex() {
  const now   = new Date();
  const ms    = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
              - Date.UTC(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate());
  return Math.max(0, Math.floor(ms / 86400000));
}

function todayWord() {
  return words[puzzleIndex() % words.length];
}

// ── Shuffle with fixed seed (Fisher-Yates + xorshift32) ───────────────────
function deterministicShuffle(arr, seed) {
  let s = seed >>> 0;
  const rng = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Default state ──────────────────────────────────────────────────────────
function defaultState() {
  const hardMode = loadHardMode();
  return {
    puzzleIndex: puzzleIndex(),
    target: todayWord(),
    guesses: [],
    evaluations: [],
    current: '',
    status: 'playing',   // playing | survived | eliminated | wordled
    undosLeft: hardMode ? UNDOS_HARD : UNDOS_NORMAL,
    undoHistory: [],     // [{word, evaluation}]
    hardMode,
  };
}

// ── Persist ────────────────────────────────────────────────────────────────
function saveState()  {
  if (state.isPractice) return;
  localStorage.setItem(STORE_GAME, JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem(STORE_GAME);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.puzzleIndex === puzzleIndex()) { state = saved; return; }
  }
  state = defaultState();
}

function loadHardMode() {
  return localStorage.getItem('nevordl_hard') === '1';
}
function saveHardMode(v) {
  localStorage.setItem('nevordl_hard', v ? '1' : '0');
}

// ── Stats ──────────────────────────────────────────────────────────────────
function defaultStats() {
  return { played: 0, survived: 0, eliminated: 0, wordled: 0, streak: 0, maxStreak: 0, lastPuzzle: -1 };
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STORE_STATS)) || defaultStats(); }
  catch { return defaultStats(); }
}
function saveStats(stats) { localStorage.setItem(STORE_STATS, JSON.stringify(stats)); }

function recordResult(status) {
  const stats = loadStats();
  stats.played++;
  const idx = state.puzzleIndex;
  if (status === 'survived') {
    stats.survived++;
    stats.streak = (stats.lastPuzzle === idx - 1) ? stats.streak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
  } else {
    if (status === 'wordled')    stats.wordled++;
    if (status === 'eliminated') stats.eliminated++;
    stats.streak = 0;
  }
  stats.lastPuzzle = idx;
  saveStats(stats);
}

// ── Wordle evaluation ──────────────────────────────────────────────────────
function evaluate(guess, target) {
  const result = Array(WORD_LEN).fill('absent');
  const tArr   = [...target];
  const gArr   = [...guess];
  // greens
  for (let i = 0; i < WORD_LEN; i++) {
    if (gArr[i] === tArr[i]) { result[i] = 'correct'; tArr[i] = null; gArr[i] = null; }
  }
  // yellows
  for (let i = 0; i < WORD_LEN; i++) {
    if (!gArr[i]) continue;
    const j = tArr.indexOf(gArr[i]);
    if (j !== -1) { result[i] = 'present'; tArr[j] = null; }
  }
  return result;
}

// ── Constraint checking ────────────────────────────────────────────────────
function satisfies(word, guesses, evaluations) {
  for (let gi = 0; gi < guesses.length; gi++) {
    const g = guesses[gi], ev = evaluations[gi];
    const info = {};
    for (let i = 0; i < WORD_LEN; i++) {
      const c = g[i], e = ev[i];
      if (!info[c]) info[c] = { min: 0, exact: null, badPos: [] };
      if (e === 'correct') { info[c].min++; }
      else if (e === 'present') { info[c].min++; info[c].badPos.push(i); }
      else { info[c].exact = info[c].min; }
    }
    for (let i = 0; i < WORD_LEN; i++) {
      const c = g[i], e = ev[i];
      if (e === 'correct' && word[i] !== c) return false;
      if (e === 'present' && word[i] === c) return false;
    }
    for (const [c, v] of Object.entries(info)) {
      const cnt = [...word].filter(x => x === c).length;
      if (cnt < v.min) return false;
      if (v.exact !== null && cnt !== v.exact) return false;
    }
  }
  return true;
}

function countValid() {
  return words.filter(w => w !== state.target && satisfies(w, state.guesses, state.evaluations)).length;
}

// Returns human-readable reason why word violates constraints, or null
function constraintError(word) {
  for (let gi = 0; gi < state.guesses.length; gi++) {
    const g = state.guesses[gi], ev = state.evaluations[gi];
    for (let i = 0; i < WORD_LEN; i++) {
      const c = g[i], e = ev[i];
      if (e === 'correct' && word[i] !== c)
        return `Буква ${c.toUpperCase()} должна стоять на позиции ${i + 1}`;
      if (e === 'present' && word[i] === c)
        return `Буква ${c.toUpperCase()} не может стоять на позиции ${i + 1}`;
    }
    const info = {};
    for (let i = 0; i < WORD_LEN; i++) {
      const c = g[i], e = ev[i];
      if (!info[c]) info[c] = { min: 0, exact: null };
      if (e === 'correct' || e === 'present') info[c].min++;
      else info[c].exact = info[c].min;
    }
    for (const [c, v] of Object.entries(info)) {
      const cnt = [...word].filter(x => x === c).length;
      if (cnt < v.min)
        return `Буква ${c.toUpperCase()} должна встречаться минимум ${v.min} раз`;
      if (v.exact !== null && cnt !== v.exact)
        return `Буква ${c.toUpperCase()} должна встречаться ровно ${v.exact} раз`;
    }
  }
  return null;
}

// ── Input handling ─────────────────────────────────────────────────────────
function addLetter(ch) {
  if (state.status !== 'playing') return;
  if (state.current.length >= WORD_LEN) return;
  state.current += ch;
  renderCurrentRow();
  animateTile(state.guesses.length, state.current.length - 1, 'pop');
}

function deleteLetter() {
  if (state.status !== 'playing') return;
  if (!state.current.length) return;
  state.current = state.current.slice(0, -1);
  renderCurrentRow();
}

async function submitGuess() {
  if (state.status !== 'playing') return;
  const word = state.current;
  if (word.length < WORD_LEN) { shakRow(state.guesses.length); toast('Недостаточно букв'); return; }
  if (!wordSet.has(word))     { shakRow(state.guesses.length); toast('Слово не найдено в словаре'); return; }

  const err = constraintError(word);
  if (err) { shakRow(state.guesses.length); toast(err); return; }

  const ev     = evaluate(word, state.target);
  const rowIdx = state.guesses.length;

  state.guesses.push(word);
  state.evaluations.push(ev);
  state.current = '';

  await flipRow(rowIdx, word, ev);
  updateKeyColors();

  if (word === state.target) {
    state.status = 'wordled';
    if (!state.isPractice) recordResult('wordled');
    saveState();
    render();
    if (!state.isPractice) setTimeout(() => openModal('stats'), 1800);
    return;
  }

  const valid = countValid();
  if (state.guesses.length >= MAX_GUESSES) {
    state.status = 'survived';
    if (!state.isPractice) recordResult('survived');
  } else if (valid === 0) {
    state.status = 'eliminated';
    if (!state.isPractice) recordResult('eliminated');
  }

  saveState();
  render();
  if (state.status !== 'playing' && !state.isPractice) setTimeout(() => openModal('stats'), 1800);
}

function doUndo() {
  if (state.status !== 'playing') return;
  if (state.undosLeft <= 0) { toast('Отмены закончились'); return; }
  if (state.guesses.length === 0) { toast('Нечего отменять'); return; }

  const word = state.guesses.pop();
  const ev   = state.evaluations.pop();
  state.undoHistory.push({ word, evaluation: ev });
  state.undosLeft--;
  state.current = '';
  saveState();
  render();
  rebuildBoard();
  updateKeyColors();
}

function doRandom() {
  if (state.status !== 'playing') return;
  if (state.guesses.length > 0 || state.current.length > 0) return;
  const valid = words.filter(w => w !== state.target);
  const pick  = valid[Math.floor(Math.random() * valid.length)];
  state.current = pick;
  renderCurrentRow();
  submitGuess();
}

function playAgain() {
  const prevTarget = state.target;
  const hardMode   = state.hardMode;
  const valid      = words.filter(w => w !== prevTarget);
  const target     = valid[Math.floor(Math.random() * valid.length)];
  state = {
    puzzleIndex:  -1,
    target,
    guesses:      [],
    evaluations:  [],
    current:      '',
    status:       'playing',
    undosLeft:    hardMode ? UNDOS_HARD : UNDOS_NORMAL,
    undoHistory:  [],
    hardMode,
    isPractice:   true,
  };
  buildBoard();
  render();
  updateKeyColors();
  toast('Новая игра — практика');
}

// ── Board ──────────────────────────────────────────────────────────────────
function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let r = 0; r < MAX_GUESSES; r++) {
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `tile-${r}-${c}`;
      board.appendChild(tile);
    }
  }
}

function rebuildBoard() {
  buildBoard();
  // Re-render submitted rows with colours
  for (let r = 0; r < state.guesses.length; r++) {
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = document.getElementById(`tile-${r}-${c}`);
      const ch   = state.guesses[r][c];
      tile.textContent  = ch.toUpperCase();
      tile.dataset.letter = ch;
      tile.className    = 'tile ' + state.evaluations[r][c];
    }
  }
}

function renderCurrentRow() {
  const row = state.guesses.length;
  for (let c = 0; c < WORD_LEN; c++) {
    const tile = document.getElementById(`tile-${row}-${c}`);
    if (!tile) return;
    const ch = state.current[c] || '';
    tile.textContent = ch.toUpperCase();
    if (ch) tile.dataset.letter = ch; else delete tile.dataset.letter;
    tile.className = 'tile';
  }
}

function animateTile(row, col, cls) {
  const tile = document.getElementById(`tile-${row}-${col}`);
  if (!tile) return;
  tile.classList.remove(cls);
  void tile.offsetWidth;
  tile.classList.add(cls);
  tile.addEventListener('animationend', () => tile.classList.remove(cls), { once: true });
}

function shakRow(row) {
  for (let c = 0; c < WORD_LEN; c++) animateTile(row, c, 'shake');
}

function flipRow(row, word, ev) {
  return new Promise(resolve => {
    const DELAY = 80, DURATION = 500;
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = document.getElementById(`tile-${row}-${c}`);
      setTimeout(() => {
        tile.classList.add('flip');
        setTimeout(() => {
          tile.textContent = word[c].toUpperCase();
          tile.dataset.letter = word[c];
          tile.className = 'tile ' + ev[c];
        }, DURATION / 2);
      }, c * DELAY);
    }
    setTimeout(resolve, WORD_LEN * DELAY + DURATION);
  });
}

// ── Keyboard ───────────────────────────────────────────────────────────────
function buildKeyboard() {
  KB_ROWS.forEach((row, i) => {
    const el = document.getElementById(`key-row-${i + 1}`);
    el.innerHTML = '';
    row.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'key' + (k.length > 1 ? ' wide' : '');
      btn.textContent = k.toUpperCase();
      btn.dataset.key = k;
      btn.addEventListener('click', () => handleKey(k));
      el.appendChild(btn);
    });
  });
}

function handleKey(k) {
  if (k === 'ВВОД' || k === 'Enter') { submitGuess(); return; }
  if (k === '⌫' || k === 'Backspace') { deleteLetter(); return; }
  if (/^[а-яёА-ЯЁ]$/.test(k)) addLetter(k.toLowerCase());
}

function updateKeyColors() {
  const best = {}; // letter -> best colour class
  const priority = { correct: 3, present: 2, absent: 1 };
  for (let gi = 0; gi < state.guesses.length; gi++) {
    for (let i = 0; i < WORD_LEN; i++) {
      const c = state.guesses[gi][i], e = state.evaluations[gi][i];
      if (!best[c] || priority[e] > priority[best[c]]) best[c] = e;
    }
  }
  document.querySelectorAll('.key').forEach(btn => {
    const k = btn.dataset.key;
    btn.classList.remove('correct', 'present', 'absent');
    if (best[k]) btn.classList.add(best[k]);
  });
}

// ── Render ─────────────────────────────────────────────────────────────────
function setCounter(id, val, useColor) {
  const el   = document.getElementById(id);
  const prev = el.dataset.val !== undefined ? Number(el.dataset.val) : null;
  el.textContent = val;
  el.dataset.val = val;

  if (useColor) {
    el.classList.remove('count-ok', 'count-warn', 'count-danger');
    if (val <= 20)       el.classList.add('count-danger');
    else if (val <= 200) el.classList.add('count-warn');
    else                 el.classList.add('count-ok');
  }

  if (prev !== null && prev !== val) {
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
    el.addEventListener('animationend', () => el.classList.remove('tick'), { once: true });
  }
}

function render() {
  // Counters
  const valid = (state.status === 'playing')
    ? countValid()
    : words.filter(w => w !== state.target && satisfies(w, state.guesses, state.evaluations)).length;
  setCounter('valid-count', valid, true);
  setCounter('undo-count',  state.undosLeft, false);

  // Practice badge on title
  const h1 = document.querySelector('header h1');
  const badge = h1.querySelector('.practice-badge');
  if (state.isPractice) {
    if (!badge) h1.insertAdjacentHTML('beforeend', '<span class="practice-badge">практика</span>');
  } else {
    if (badge) badge.remove();
  }

  // Board
  rebuildBoard();
  if (state.status === 'playing') renderCurrentRow();

  // Undo / random buttons
  renderActionArea();

  // Hard mode toggle
  document.getElementById('toggle-hard-mode').checked = state.hardMode;
}

function renderActionArea() {
  // Ensure undo-area exists
  let area = document.getElementById('undo-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'undo-area';
    document.querySelector('main').insertBefore(area, document.getElementById('keyboard'));
  }
  area.innerHTML = '';

  const panel = document.getElementById('result-panel');

  if (state.status !== 'playing') {
    // Show result panel, hide undo area
    const msgs = {
      survived:   ['Вы выжили!', `Загаданное слово: ${state.target.toUpperCase()}`],
      wordled:    ['Упс, угадали!', `Слово было: ${state.target.toUpperCase()}`],
      eliminated: ['Слова закончились!', `Слово было: ${state.target.toUpperCase()}`],
    };
    const [title, sub] = msgs[state.status] || ['', ''];
    const statsBtn = state.isPractice
      ? ''
      : `<button class="btn-primary" id="banner-stats-btn">Статистика</button>`;
    panel.innerHTML = `
      <div class="result-title">${title}</div>
      <div class="result-word">${sub}</div>
      <div class="result-actions">
        ${statsBtn}
        <button class="btn-primary" id="banner-share-btn">Поделиться</button>
        <button class="btn-undo" id="banner-again-btn">Сыграть снова</button>
      </div>`;
    if (!state.isPractice) {
      document.getElementById('banner-stats-btn').onclick = () => { renderStats(); openModal('stats'); };
    }
    document.getElementById('banner-share-btn').onclick = shareResult;
    document.getElementById('banner-again-btn').onclick = playAgain;
    panel.classList.remove('hidden');
    return;
  }

  panel.classList.add('hidden');

  if (state.guesses.length === 0) {
    const rndBtn = document.createElement('button');
    rndBtn.className = 'btn-random';
    rndBtn.textContent = '🎲 Случайное первое слово';
    rndBtn.onclick = doRandom;
    area.appendChild(rndBtn);
  }

  if (state.guesses.length > 0) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn-undo';
    undoBtn.textContent = `↩ Отмена (${state.undosLeft} осталось)`;
    undoBtn.disabled = state.undosLeft <= 0;
    undoBtn.onclick = doUndo;
    area.appendChild(undoBtn);
  }
}

// ── Share ──────────────────────────────────────────────────────────────────
function shareResult() {
  const statusText = { survived: 'ВЫЖИЛ', wordled: 'ВОРДЛНУЛ', eliminated: 'ВЫБЫЛ' };
  const emoji = { correct: '🟩', present: '🟨', absent: '⬜' };
  const lines = [`Не вордли #${state.puzzleIndex + 1} — ${statusText[state.status] || ''}`];
  for (const ev of state.evaluations) {
    lines.push(ev.map(e => emoji[e]).join(''));
  }
  lines.push(`Отмен использовано: ${(state.hardMode ? UNDOS_HARD : UNDOS_NORMAL) - state.undosLeft}`);
  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => toast('Скопировано!')).catch(() => toast('Не удалось скопировать'));
}

// ── Stats modal ────────────────────────────────────────────────────────────
function renderStats() {
  const s = loadStats();
  document.getElementById('stat-played').textContent    = s.played;
  document.getElementById('stat-win-pct').textContent   = s.played ? Math.round(s.survived / s.played * 100) : 0;
  document.getElementById('stat-streak').textContent    = s.streak;
  document.getElementById('stat-max-streak').textContent = s.maxStreak;

  const max = Math.max(s.survived, s.eliminated, s.wordled, 1);
  const setBar = (id, val) => {
    const bar = document.getElementById(id);
    bar.style.width = Math.max(8, Math.round(val / max * 100)) + '%';
    bar.querySelector('span').textContent = val;
  };
  setBar('bar-survived',  s.survived);
  setBar('bar-eliminated', s.eliminated);
  setBar('bar-wordled',   s.wordled);

  const footer = document.getElementById('stats-footer');
  if (state.status !== 'playing') {
    footer.classList.remove('hidden');
    document.getElementById('btn-share').onclick = shareResult;
    startCountdown();
  } else {
    footer.classList.add('hidden');
  }
}

function startCountdown() {
  const update = () => {
    const now  = new Date();
    const next = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const diff = next - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown').textContent =
      `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  update();
  setInterval(update, 1000);
}

// ── Modals ─────────────────────────────────────────────────────────────────
function openModal(name) {
  if (name === 'stats') renderStats();
  document.getElementById(`overlay-${name}`).classList.add('open');
}
function closeModal(name) {
  document.getElementById(`overlay-${name}`).classList.remove('open');
}

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, duration = 2000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Event bindings ─────────────────────────────────────────────────────────
function bindEvents() {
  // Physical keyboard
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-overlay.open')) return;
    if (e.key === 'Enter')     { handleKey('ВВОД'); return; }
    if (e.key === 'Backspace') { handleKey('⌫');   return; }
    const ch = e.key.toLowerCase();
    if (/^[а-яё]$/.test(ch)) handleKey(ch);
  });

  // Header buttons
  document.getElementById('btn-how-to-play').onclick = () => openModal('how-to-play');
  document.getElementById('btn-stats').onclick       = () => openModal('stats');
  document.getElementById('btn-settings').onclick    = () => openModal('settings');

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.close);
  });

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.onclick = e => { if (e.target === ov) ov.classList.remove('open'); };
  });

  // Hard mode toggle
  document.getElementById('toggle-hard-mode').onchange = e => {
    if (state.guesses.length > 0) {
      toast('Нельзя менять режим во время игры');
      e.target.checked = state.hardMode;
      return;
    }
    state.hardMode  = e.target.checked;
    state.undosLeft = state.hardMode ? UNDOS_HARD : UNDOS_NORMAL;
    saveHardMode(state.hardMode);
    saveState();
    render();
  };

  // Show how-to-play on first ever visit
  if (!localStorage.getItem('nevordl_visited')) {
    localStorage.setItem('nevordl_visited', '1');
    setTimeout(() => openModal('how-to-play'), 300);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
