'use strict';
/**
 * Builds the drawing list for one price tag. The same scene feeds the PDF writer and
 * the on-screen preview, so what you see is exactly what gets printed.
 * Item kinds: {kind:'path', d, color:[r,g,b]} and {kind:'ring', cx, cy, r, w, color}.
 * Coordinates: millimetres, origin = top-left corner of the tag, y down.
 */
const A = require('./assets');
const C = require('./config');
const P = require('./path');
const T = require('./text');

const BLACK = [0, 0, 0];

function splitBalanced(str) {
  const words = str.split(' ');
  if (words.length < 2) return null;
  const cands = [];
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const wa = T.inkExtent(T.NAME, a).w, wb = T.inkExtent(T.NAME, b).w;
    // a short preposition ("З", "В", "ДО") belongs with the word after it, as on the original tags
    const dangling = words[i - 1].length <= 2 && words.length > 2 && wa >= wb;
    cands.push({ lines: [a, b], m: Math.max(wa, wb), dangling });
  }
  cands.sort((x, y) => x.m - y.m);
  const best = cands[0];
  const pref = cands.filter((c) => !c.dangling)[0];
  // keep the preposition with the next word unless that makes the text clearly smaller
  if (best.dangling && pref && pref.m <= best.m * 1.35) return pref;
  return best;
}

/** Decide font size / line breaks for a product name. Returns {ok, lines:[{text,k,baseline}], reason} */
function fitName(fmtKey, rawName) {
  const F = C.formats[fmtKey];
  const name = T.normalizeName(rawName);
  if (!name) return { ok: false, reason: 'empty' };
  const bad = T.missingChars(T.NAME, name);
  if (bad.length) return { ok: false, reason: 'chars', chars: bad };
  const capU = T.CAP;
  const one = F.name.one, two = F.name.two;

  // try one line
  const wu = T.inkExtent(T.NAME, name).w;
  const capNeed = (one.maxW / wu) * capU; // cap height (mm) at which the line exactly fits
  const cap1 = Math.min(one.cap, capNeed);
  if (cap1 >= one.cap * one.minScale) {
    return { ok: true, lines: [{ text: name, k: cap1 / capU, baseline: one.baseline }], shrunk: cap1 < one.cap - 1e-6 };
  }
  // two lines
  const sp = splitBalanced(name);
  if (sp) {
    const capNeed2 = (two.maxW / sp.m) * capU;
    const cap2 = Math.min(two.cap, capNeed2);
    if (cap2 >= two.cap * two.minScale) {
      return {
        ok: true,
        lines: sp.lines.map((t, i) => ({ text: t, k: cap2 / capU, baseline: two.baselines[i] })),
        shrunk: cap2 < two.cap - 1e-6,
      };
    }
  }
  return { ok: false, reason: 'long' };
}

/** Price and ГРН are laid out as one group centred between group.x0 and group.x1, sized by the real ink width. */
function priceLayout(fmtKey, price) {
  const F = C.formats[fmtKey];
  const str = String(price);
  const ink = T.inkExtent(T.PRICE, str);
  if (!ink) return null;
  const gk = F.grn.cap / T.CAP, gs = F.grn.stretch || 1;
  const gi = T.inkExtent(T.NAME, 'ГРН');
  const gW = gi.w * gk * gs;
  const gr = F.price.group;
  const avail = gr.x1 - gr.x0 - F.grn.gap - gW;
  let k = F.price.height / T.DIGIT;
  if (ink.w * k > avail) k = avail / ink.w;
  const pW = ink.w * k;
  const left = gr.x0 + (gr.x1 - gr.x0 - (pW + F.grn.gap + gW)) / 2;
  return {
    s: str, k, w: pW, x: left - ink.x0 * k, baseline: F.price.baseline,
    grnX: left + pW + F.grn.gap - gi.x0 * gk * gs, grnK: gk, grnS: gs, grnBaseline: F.grn.baseline,
  };
}

/** Everything on a tag that never changes (background, swoosh, logo, ГРН). Drawn once per format. */
function staticScene(fmtKey) {
  const F = C.formats[fmtKey];
  const art = A.tags[fmtKey];
  const white = art.white, lime = art.lime;
  const items = [];
  items.push({ kind: 'path', d: P.roundedRect(F.tagW, F.tagH, F.radius), color: BLACK });
  items.push({ kind: 'path', d: art.swoosh, color: white });

  // logo (master traced at L scale, scaled to this format's ring)
  const s = art.logo.r / A.logo.r;
  const m = [s, 0, 0, s, art.logo.cx, art.logo.cy];
  items.push({ kind: 'path', d: P.transform(A.logo.lime, m), color: lime });
  items.push({ kind: 'path', d: P.transform(A.logo.white, m), color: white });
  items.push({ kind: 'ring', cx: art.logo.cx, cy: art.logo.cy, r: art.logo.r - (A.logo.ringW * s) / 2, w: A.logo.ringW * s, color: lime });
  return items;
}

/** The variable parts: product name and price. */
function dynamicScene(fmtKey, rawName, price) {
  const F = C.formats[fmtKey];
  const art = A.tags[fmtKey];
  const white = art.white, lime = art.lime;
  const items = [];
  const fit = fitName(fmtKey, rawName);
  if (fit.ok) {
    for (const ln of fit.lines) {
      const ix = T.inkExtent(T.NAME, ln.text).x0;
      items.push({ kind: 'path', d: T.textPath(T.NAME, ln.text, ln.k, F.name.x - ix * ln.k, ln.baseline, F.name.angle), color: white });
    }
  }
  // price + ГРН
  const pl = priceLayout(fmtKey, price);
  if (pl) {
    items.push({ kind: 'path', d: T.textPath(T.PRICE, pl.s, pl.k, pl.x, pl.baseline, 0), color: lime });
    items.push({ kind: 'path', d: T.textPath(T.NAME, 'ГРН', pl.grnK, pl.grnX, pl.grnBaseline, 0, pl.grnS), color: lime });
  }
  return items;
}

function tagScene(fmtKey, rawName, price) {
  return staticScene(fmtKey).concat(dynamicScene(fmtKey, rawName, price));
}

module.exports = { staticScene, dynamicScene, tagScene, fitName, priceLayout };
