'use strict';
const C = require('./config');
const T = require('./text');
const S = require('./scene');

const MSG = {
  name: 'Вкажіть назву товару',
  price: 'Ціна повинна бути більшою за нуль',
  qty: 'Вкажіть кількість цінників (ціле число від 1)',
  format: 'Оберіть формат цінника',
  long: 'Назва занадто довга для обраного формату',
  chars: 'Назва містить недопустимі символи',
  total: 'Забагато цінників за один раз. Максимум — ' + C.limits.maxTotal,
  empty: 'Додайте хоча б один товар',
};

/** rows: [{name, price, format, qty}] raw from the form (strings allowed). */
function validate(rows) {
  const errors = []; // {row, field, message}
  const clean = [];
  let total = 0;
  rows.forEach((r, i) => {
    const e = (field, message) => errors.push({ row: i, field, message });
    const name = T.normalizeName(r.name);
    if (!name) e('name', MSG.name);
    else if (name.length > C.limits.maxNameLen) e('name', MSG.long);
    else {
      const bad = T.missingChars(T.NAME, name);
      if (bad.length) e('name', MSG.chars + ': ' + bad.join(' '));
    }
    const priceStr = String(r.price == null ? '' : r.price).trim().replace(',', '.');
    const priceNum = Number(priceStr);
    if (!/^\d+$/.test(priceStr.replace(/\.0+$/, '')) || !(priceNum > 0) || priceNum > C.limits.maxPrice) {
      e('price', MSG.price);
    }
    const qtyStr = String(r.qty == null ? '' : r.qty).trim();
    const qtyNum = Number(qtyStr);
    if (!/^\d+$/.test(qtyStr) || !(qtyNum >= 1) || qtyNum > C.limits.maxQty) e('qty', MSG.qty);
    if (r.format !== 'L' && r.format !== 'S') e('format', MSG.format);
    if (!errors.some((x) => x.row === i)) {
      const fit = S.fitName(r.format, name);
      if (!fit.ok) e('name', fit.reason === 'chars' ? MSG.chars : MSG.long);
    }
    if (!errors.some((x) => x.row === i)) {
      clean.push({ name, price: String(Math.round(priceNum)), format: r.format, qty: qtyNum });
      total += qtyNum;
    }
  });
  if (!rows.length) errors.push({ row: -1, field: 'list', message: MSG.empty });
  if (total > C.limits.maxTotal && !errors.length) errors.push({ row: -1, field: 'total', message: MSG.total });
  return { ok: errors.length === 0, errors, items: clean, total };
}

module.exports = { validate, MSG };
