'use strict';
const { validate } = require('./validate');
const { layout, summarize } = require('./layout');
const { buildPdf, buildCalibrationPdf } = require('./pdf');

/** rows -> {ok, errors, summary, sheets, pdf(deflate)} */
function plan(rows) {
  const v = validate(rows);
  if (!v.ok) return { ok: false, errors: v.errors };
  const sheets = layout(v.items);
  return { ok: true, errors: [], items: v.items, sheets, summary: summarize(v.items) };
}

async function generate(rows, deflate, options) {
  const p = plan(rows);
  if (!p.ok) return p;
  const manifest = p.sheets.map((s, i) => `${i + 1}:${s.format}:` + s.tags.map((t) => t.name + '=' + t.price).join('|'));
  const pdf = await buildPdf(p.sheets, deflate, Object.assign({}, options, { keywords: manifest.join(' ; ') }));
  return Object.assign(p, { pdf });
}

module.exports = { plan, generate, buildCalibrationPdf, validate, layout, summarize };
