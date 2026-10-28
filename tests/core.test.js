'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { plan, validate } = require('../src');
const S = require('../src/scene');
const T = require('../src/text');

const row = (name, price, format, qty) => ({ name, price: String(price), format, qty: String(qty) });
const counts = (rows) => { const p = plan(rows); assert.ok(p.ok, JSON.stringify(p.errors)); return p.sheets.map((s) => s.format + s.tags.length); };

test('ТЗ пример 1: Чіабата L x9 -> 6 + 3', () => assert.deepStrictEqual(counts([row('Чіабата', 69, 'L', 9)]), ['L6', 'L3']));
test('ТЗ пример 2: Трубочки S x17 -> 8, 8, 1', () => assert.deepStrictEqual(counts([row('Трубочки', 35, 'S', 17)]), ['S8', 'S8', 'S1']));
test('ТЗ пример 3: 4 + 2 одного формата -> один лист', () => assert.deepStrictEqual(counts([row('Чіабата', 69, 'L', 4), row('Паніні', 89, 'L', 2)]), ['L6']));
test('ТЗ пример 4: 5 + 5 -> 6 + 4', () => assert.deepStrictEqual(counts([row('Чіабата', 69, 'L', 5), row('Паніні', 89, 'L', 5)]), ['L6', 'L4']));
test('Смешанные форматы не делят лист', () => assert.deepStrictEqual(counts([row('Чіабата', 69, 'L', 4), row('Трубочки', 35, 'S', 3)]), ['L4', 'S3']));
test('Смешанный: L 9 + L 3 + S 8 -> L6, L6, S8', () => assert.deepStrictEqual(counts([row('Чіабата', 69, 'L', 9), row('Паніні', 89, 'L', 3), row('Трубочки', 35, 'S', 8)]), ['L6', 'L6', 'S8']));

test('Количества 1,5,6,7,8,9,12,17,25 для обоих форматов', () => {
  for (const f of ['L', 'S']) {
    const cap = f === 'L' ? 6 : 8;
    for (const q of [1, 5, 6, 7, 8, 9, 12, 17, 25]) {
      const c = counts([row('Тест', 10, f, q)]);
      assert.strictEqual(c.length, Math.ceil(q / cap), f + q);
      assert.strictEqual(c.reduce((a, s) => a + Number(s.slice(1)), 0), q, f + q);
      assert.ok(c.slice(0, -1).every((s) => Number(s.slice(1)) === cap), 'only the last sheet may be partial');
    }
  }
});

test('Порядок: слева направо, сверху вниз, по списку', () => {
  const p = plan([row('А', 1, 'S', 2), row('Б', 2, 'S', 2)]);
  assert.deepStrictEqual(p.sheets[0].tags.map((t) => [t.name, t.col, t.row]), [['А', 0, 0], ['А', 1, 0], ['Б', 0, 1], ['Б', 1, 1]]);
});

test('Ценники не выходят за лист и не пересекаются', () => {
  for (const f of ['L', 'S']) {
    const p = plan([row('Тест', 10, f, 8)]);
    const F = require('../src/config').formats[f];
    const t = p.sheets[0].tags;
    t.forEach((a) => { assert.ok(a.x >= 5 && a.y >= 5 && a.x + F.tagW <= 205 && a.y + F.tagH <= 292, 'margins ' + f); });
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
      const a = t[i], b = t[j];
      assert.ok(a.x + F.tagW <= b.x + 1e-9 || b.x + F.tagW <= a.x + 1e-9 || a.y + F.tagH <= b.y + 1e-9 || b.y + F.tagH <= a.y + 1e-9, 'overlap');
    }
  }
});

test('Украинские буквы І Ї Є Ґ и разные названия помещаются', () => {
  for (const n of ['Чіабата', 'Їжачок', 'Єгер', 'Ґанок', 'Хот-дог', 'Паніні з сиром', 'Круасан з шинкою', 'Печиво з передбаченням']) {
    for (const f of ['L', 'S']) assert.ok(S.fitName(f, n).ok, n + ' ' + f);
  }
  assert.strictEqual(T.missingChars(T.NAME, 'ЇЄҐІ').length, 0);
});

test('Цены из 1, 2, 3, 4 цифр', () => {
  for (const p of ['5', '35', '129', '1050']) for (const f of ['L', 'S']) {
    const l = S.priceLayout(f, p);
    assert.ok(l && l.w > 0, p);
  }
});

test('Валидация: сообщения на украинском', () => {
  const v = (r) => validate([r]).errors.map((e) => e.message);
  assert.deepStrictEqual(v(row('', 5, 'L', 1)), ['Вкажіть назву товару']);
  assert.deepStrictEqual(v(row('Х', 0, 'L', 1)), ['Ціна повинна бути більшою за нуль']);
  assert.deepStrictEqual(v(row('Х', '', 'L', 1)), ['Ціна повинна бути більшою за нуль']);
  assert.deepStrictEqual(v(row('Х', 'abc', 'L', 1)), ['Ціна повинна бути більшою за нуль']);
  assert.deepStrictEqual(v(row('Х', 5, 'L', 0)), ['Вкажіть кількість цінників (ціле число від 1)']);
  assert.deepStrictEqual(v(row('Х', 5, 'L', 2.5)), ['Вкажіть кількість цінників (ціле число від 1)']);
  assert.deepStrictEqual(v(row('Х', 5, '', 1)), ['Оберіть формат цінника']);
  assert.deepStrictEqual(v(row('Дуже довга назва товару яка точно не поміститься на малий цінник', 5, 'S', 1)), ['Назва занадто довга для обраного формату']);
  assert.match(v(row('Кава ☕', 5, 'L', 1))[0], /недопустимі символи/);
  assert.strictEqual(validate([]).ok, false);
  assert.match(validate([row('Х', 5, 'L', 200), row('Й', 5, 'L', 200)]).errors[0].message, /Максимум — 300/);
});

test('Подготовка: пробелы, регистр, апостроф', () => {
  const p = plan([row('  чіабата  ', 69, 'L', 1)]);
  assert.strictEqual(p.sheets[0].tags[0].name, 'ЧІАБАТА');
});
