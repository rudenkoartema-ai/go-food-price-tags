'use strict';
/** Tiny SVG path toolkit: absolute M L Q C Z only (that is all the assets contain). */

const cache = new Map();

function parse(d) {
  let seg = cache.get(d);
  if (seg) return seg;
  seg = [];
  const re = /([MLQCZ])|(-?\d*\.?\d+(?:e-?\d+)?)/g;
  let m, cur = null;
  while ((m = re.exec(d))) {
    if (m[1]) {
      cur = { c: m[1], v: [] };
      seg.push(cur);
    } else {
      cur.v.push(parseFloat(m[2]));
    }
  }
  if (cache.size > 400) cache.clear();
  cache.set(d, seg);
  return seg;
}

const f = (n) => {
  const s = n.toFixed(3);
  return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
};

/** x' = a x + c y + e ; y' = b x + d y + f */
function transform(d, [a, b, c, dd, e, ff]) {
  const seg = parse(d);
  let out = '';
  for (const s of seg) {
    out += s.c;
    const v = s.v;
    for (let i = 0; i < v.length; i += 2) {
      const x = v[i], y = v[i + 1];
      out += (i ? ' ' : '') + f(a * x + c * y + e) + ' ' + f(b * x + dd * y + ff);
    }
  }
  return out;
}

function roundedRect(w, h, r) {
  const k = r * 0.5523;
  return (
    `M${f(r)} 0L${f(w - r)} 0C${f(w - r + k)} 0 ${f(w)} ${f(r - k)} ${f(w)} ${f(r)}` +
    `L${f(w)} ${f(h - r)}C${f(w)} ${f(h - r + k)} ${f(w - r + k)} ${f(h)} ${f(w - r)} ${f(h)}` +
    `L${f(r)} ${f(h)}C${f(r - k)} ${f(h)} 0 ${f(h - r + k)} 0 ${f(h - r)}` +
    `L0 ${f(r)}C0 ${f(r - k)} ${f(r - k)} 0 ${f(r)} 0Z`
  );
}

module.exports = { transform, roundedRect, f };
