import { describe, it, expect } from 'vitest';
import {
  evaluate, satisfies, constraintError, countValid, deterministicShuffle,
  UNDOS_NORMAL, UNDOS_HARD,
} from '../js/logic.js';

// Сокращения для удобочитаемости
const C = 'correct';
const P = 'present';
const A = 'absent';

// ─────────────────────────────────────────────────────────────────────────────
// evaluate(guess, target)
// ─────────────────────────────────────────────────────────────────────────────
describe('evaluate', () => {
  it('полное совпадение → всё correct', () => {
    expect(evaluate('гроза', 'гроза')).toEqual([C, C, C, C, C]);
  });

  it('нет общих букв → всё absent', () => {
    // гроза = г,р,о,з,а  |  вилки = в,и,л,к,и  → нет пересечений
    expect(evaluate('вилки', 'гроза')).toEqual([A, A, A, A, A]);
  });

  it('анаграмма → всё present', () => {
    // азрог — те же буквы, что в гроза, но все сдвинуты
    expect(evaluate('азрог', 'гроза')).toEqual([P, P, P, P, P]);
  });

  it('смешанный результат (correct + present + absent)', () => {
    // target гроза: г[0],р[1],о[2],з[3],а[4]
    // guess  горка: г[0]=г→C, о[1]≠р но о∈target→P, р[2]≠о но р∈target→P, к[3]∉target→A, а[4]=а→C
    expect(evaluate('горка', 'гроза')).toEqual([C, P, P, A, C]);
  });

  it('дубль в guess, в target буква одна — второй экземпляр absent', () => {
    // target норма: н[0],о[1],р[2],м[3],а[4]
    // guess  онона: о[0],н[1],о[2],н[3],а[4]
    // Зелёные: а[4]=а[4]→C
    // Жёлтые: о[0]→pos 1 (present), н[1]→pos 0 (present), о[2]→уже занято (absent), н[3]→уже занято (absent)
    expect(evaluate('онона', 'норма')).toEqual([P, P, A, A, C]);
  });

  it('дубль в target, в guess одна копия — правильно определяет present', () => {
    // target банка: б[0],а[1],н[2],к[3],а[4]  — а дважды
    // guess  карта: к[0],а[1],р[2],т[3],а[4]
    // Зелёные: а[1]=а[1]→C, а[4]=а[4]→C
    // Жёлтые: к[0]→pos 3 (present), р[2]→нет (absent), т[3]→нет (absent)
    expect(evaluate('карта', 'банка')).toEqual([P, C, A, A, C]);
  });

  it('дубль в target, в guess тоже два — оба получают цвет', () => {
    // target банка: б,а,н,к,а  — а дважды
    // guess  кавал: к,а,в,а,л  — а дважды
    // Зелёные: а[1]=а[1]→C
    // Жёлтые: к[0]→pos 3 (present), а[3]→pos 4 (present), в[2]→нет (absent), л[4]→нет (absent)
    expect(evaluate('кавал', 'банка')).toEqual([P, C, A, P, A]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// satisfies(word, guesses, evaluations)
// ─────────────────────────────────────────────────────────────────────────────
describe('satisfies', () => {
  it('без истории — любое слово проходит', () => {
    expect(satisfies('гроза', [], [])).toBe(true);
    expect(satisfies('банка', [], [])).toBe(true);
  });

  it('после all-absent — слова с этими буквами отфильтрованы', () => {
    const gs = ['вилки'];
    const es = [[A, A, A, A, A]];
    expect(satisfies('гроза', gs, es)).toBe(true);   // нет в,и,л,к
    expect(satisfies('грива', gs, es)).toBe(false);  // содержит и и в
    expect(satisfies('волки', gs, es)).toBe(false);  // содержит в,л,к,и
  });

  it('нарушение correct-позиции', () => {
    // горка → [C,P,P,A,C]: г на pos 0 обязателен, а на pos 4 обязательна
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    expect(satisfies('гроза', gs, es)).toBe(true);
    expect(satisfies('ворза', gs, es)).toBe(false);  // pos 0 не г
    expect(satisfies('гроза', gs, es)).toBe(true);
  });

  it('нарушение present-позиции (буква есть, но не там)', () => {
    // горка → [C,P,P,A,C]: о не может стоять на pos 1
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    expect(satisfies('горза', gs, es)).toBe(false);  // о снова на pos 1 → нарушение present
  });

  it('минимальное вхождение (present/correct задаёт min)', () => {
    // горка → [C,P,P,A,C]: г на pos 0, а на pos 4, о и р должны присутствовать, к=0
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    expect(satisfies('гтута', gs, es)).toBe(false);  // нет о — min(о)=1 нарушен
    expect(satisfies('гтрза', gs, es)).toBe(false);  // р на pos 2 — нарушает present(р не pos 2)
    expect(satisfies('грота', gs, es)).toBe(true);   // г[0]✓, р не pos 2✓, о не pos 1✓, к=0✓, а[4]✓
  });

  it('точный счёт (exact) через три экземпляра одной буквы', () => {
    // target банка (2 «а»), guess ааван = а,а,в,а,н
    // evaluations: [P, C, A, A, P]
    // Это задаёт: а ровно 2 раза, а не на pos 0, а обязана на pos 1
    const gs = ['ааван'];
    const es = [[P, C, A, A, P]];

    // банка: а[1]✓, а не pos 0 ✓, а count=2 ✓, н не pos 4 ✓ → true
    expect(satisfies('банка', gs, es)).toBe(true);
    // банст: б,а,н,с,т — а только 1 раз, но exact=2 → false
    expect(satisfies('банст', gs, es)).toBe(false);
    // ванна: содержит в, а в exact=0 (absent из guess) → false
    expect(satisfies('ванна', gs, es)).toBe(false);
  });

  it('накопленные ограничения после двух ходов', () => {
    // Ход 1: горка → [C,P,P,A,C]  (target гроза)
    // Ход 2: гроть → г[0]✓, р[1]✓, о[2]? о=о → C, т[3]∉target → A, ь[4]≠а → A
    //        evaluate('гроть','гроза') = [C,C,C,A,A]
    const gs = ['горка', 'гроть'];
    const es = [[C, P, P, A, C], [C, C, C, A, A]];
    expect(satisfies('гроза', gs, es)).toBe(true);
    expect(satisfies('ворза', gs, es)).toBe(false);  // г не на pos 0
    expect(satisfies('грета', gs, es)).toBe(false);  // е не нарушает, но о должна быть на pos 2
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// constraintError(word, guesses, evaluations)
// ─────────────────────────────────────────────────────────────────────────────
describe('constraintError', () => {
  it('нет ходов → всегда null', () => {
    expect(constraintError('гроза', [], [])).toBeNull();
  });

  it('нет нарушений → null', () => {
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    expect(constraintError('гроза', gs, es)).toBeNull();
  });

  it('нарушение correct-позиции', () => {
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    // г обязан на pos 1, но "ворза"[0] = в
    const err = constraintError('ворза', gs, es);
    expect(err).toMatch(/Г.*позиции 1/);
  });

  it('нарушение present-позиции', () => {
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    // о получила present на pos 1 → не может снова стоять на pos 1
    const err = constraintError('гоoza', gs, es);
    // используем реальный тест: "горза" — о на pos 1 снова
    const err2 = constraintError('горза', gs, es);
    expect(err2).toMatch(/О.*позиции 2/);
  });

  it('нарушение минимального вхождения', () => {
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    // о должна встречаться минимум 1 раз, в "гтута" её нет
    const err = constraintError('гтута', gs, es);
    expect(err).toMatch(/О.*минимум 1/);
  });

  it('нарушение точного количества (много)', () => {
    // ааван → [P,C,A,A,P]: а ровно 2 раза
    const gs = ['ааван'];
    const es = [[P, C, A, A, P]];
    // "бааза" = б,а,а,з,а — три «а», exact=2 → ошибка
    const err = constraintError('бааза', gs, es);
    expect(err).toMatch(/А.*ровно 2/);
  });

  it('нарушение точного количества (мало)', () => {
    const gs = ['ааван'];
    const es = [[P, C, A, A, P]];
    // "банст" = б,а,н,с,т — а только 1 раз, min(а)=2 → ошибка
    const err = constraintError('банст', gs, es);
    expect(err).toMatch(/А.*минимум 2/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// countValid(words, target, guesses, evaluations)
// ─────────────────────────────────────────────────────────────────────────────
describe('countValid', () => {
  const wordList = ['гроза', 'банка', 'норма', 'масло', 'вилки', 'карта'];

  it('без ходов — все слова кроме target', () => {
    expect(countValid(wordList, 'гроза', [], [])).toBe(5);
  });

  it('после all-absent для в,и,л,к — удаляет все слова с этими буквами', () => {
    const gs = ['вилки'];
    const es = [[A, A, A, A, A]];
    // вилки: содержит в,и,л,к → не satisfies
    // карта: содержит к → не satisfies
    // банка: содержит к → не satisfies
    // масло: содержит л → не satisfies
    // норма: не содержит в,и,л,к → satisfies ✓
    // гроза: target, исключается countValid
    const valid = countValid(wordList, 'гроза', gs, es);
    expect(valid).toBe(1); // только норма
  });

  it('после угадывания target — countValid исключает сам target', () => {
    // even if target satisfies constraints, it's excluded
    const gs = ['горка'];
    const es = [[C, P, P, A, C]];
    const result = countValid(['гроза', 'гроза'], 'гроза', gs, es);
    expect(result).toBe(0); // оба элемента = target, все исключены
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deterministicShuffle
// ─────────────────────────────────────────────────────────────────────────────
describe('deterministicShuffle', () => {
  it('возвращает те же элементы', () => {
    const arr = ['а', 'б', 'в', 'г', 'д'];
    const shuffled = deterministicShuffle(arr, 1337);
    expect(shuffled.sort()).toEqual([...arr].sort());
  });

  it('с одинаковым seed всегда одинаковый результат', () => {
    const arr = ['гроза', 'банка', 'норма', 'масло', 'вилки'];
    expect(deterministicShuffle(arr, 42)).toEqual(deterministicShuffle(arr, 42));
  });

  it('с разными seed разный результат (вероятностно)', () => {
    const arr = Array.from({ length: 20 }, (_, i) => String(i));
    expect(deterministicShuffle(arr, 1)).not.toEqual(deterministicShuffle(arr, 2));
  });

  it('не мутирует исходный массив', () => {
    const arr = ['а', 'б', 'в'];
    const copy = [...arr];
    deterministicShuffle(arr, 1337);
    expect(arr).toEqual(copy);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Константы режимов
// ─────────────────────────────────────────────────────────────────────────────
describe('константы', () => {
  it('нормальный режим — 5 отмен', () => {
    expect(UNDOS_NORMAL).toBe(5);
  });

  it('хард-мод — 2 отмены', () => {
    expect(UNDOS_HARD).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Игровые сценарии (изолированная логика, без DOM)
// ─────────────────────────────────────────────────────────────────────────────
describe('игровые сценарии', () => {
  it('wordled: угадывание target возвращает all-correct', () => {
    const target = 'масло';
    const guess  = 'масло';
    expect(evaluate(guess, target)).toEqual([C, C, C, C, C]);
    expect(guess === target).toBe(true);
  });

  it('survived: 6 ходов без угадывания — валидные слова остаются', () => {
    const target = 'гроза';
    const guesses     = ['вилки', 'фонды', 'шепот', 'трубы', 'зажим', 'песок'];
    const evaluations = guesses.map(g => evaluate(g, target));

    // Ни одна попытка не равна target
    expect(guesses.every(g => g !== target)).toBe(true);

    // Проверяем, что evaluate не вернул all-correct ни разу
    const wordled = evaluations.some(ev => ev.every(e => e === C));
    expect(wordled).toBe(false);
  });

  it('eliminated: после точных ограничений не остаётся валидных слов', () => {
    // Маленький словарь: только 'гроза'
    const words  = ['гроза'];
    const target = 'гроза';

    // Угадываем всё кроме target, но target — единственное слово
    // countValid должен вернуть 0 (target всегда исключается)
    expect(countValid(words, target, [], [])).toBe(0);
  });

  it('undo: откат снимает ограничения', () => {
    const target = 'гроза';
    const gs = ['горка'];
    const es = [evaluate('горка', target)];

    // С историей: 'ворза' не проходит (г обязана на pos 0)
    expect(satisfies('ворза', gs, es)).toBe(false);

    // После undo (пустые массивы): то же слово проходит
    expect(satisfies('ворза', [], [])).toBe(true);
  });

  it('последовательность: два хода сужают возможности', () => {
    const target = 'гроза';
    const words  = ['гроза', 'гроты', 'горка', 'банка', 'масло'];

    const before = countValid(words, target, [], []);

    const gs1 = ['горка'];
    const es1 = [evaluate('горка', target)];
    const after1 = countValid(words, target, gs1, es1);

    const gs2 = ['горка', 'гроть'];
    const es2 = [...es1, evaluate('гроть', target)];
    const after2 = countValid(words, target, gs2, es2);

    expect(before).toBeGreaterThan(after1);
    expect(after1).toBeGreaterThanOrEqual(after2);
  });
});
