export const WORD_LEN    = 5;
export const MAX_GUESSES = 6;
export const UNDOS_NORMAL = 5;
export const UNDOS_HARD   = 2;

export function deterministicShuffle(arr, seed) {
  let s = seed >>> 0;
  const rng = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function evaluate(guess, target) {
  const result = Array(WORD_LEN).fill('absent');
  const tArr   = [...target];
  const gArr   = [...guess];
  for (let i = 0; i < WORD_LEN; i++) {
    if (gArr[i] === tArr[i]) { result[i] = 'correct'; tArr[i] = null; gArr[i] = null; }
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (!gArr[i]) continue;
    const j = tArr.indexOf(gArr[i]);
    if (j !== -1) { result[i] = 'present'; tArr[j] = null; }
  }
  return result;
}

export function satisfies(word, guesses, evaluations) {
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

// guesses/evaluations переданы явно, чтобы функция была чистой
export function constraintError(word, guesses, evaluations) {
  for (let gi = 0; gi < guesses.length; gi++) {
    const g = guesses[gi], ev = evaluations[gi];
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

export function countValid(words, target, guesses, evaluations) {
  return words.filter(w => w !== target && satisfies(w, guesses, evaluations)).length;
}
