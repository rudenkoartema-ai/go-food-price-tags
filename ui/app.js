(function () {
  'use strict';
  var G = __req('index'), PV = __req('preview'), A = __req('assets'), C = __req('config'), L = __req('layout');
  var STORE = 'gofood.rows.v1';
  var uid = 0;
  var rows = [];
  var showAll = false; // show "required" errors only after the first generate attempt
  var $ = function (id) { return document.getElementById(id); };

  function newRow(p) { return Object.assign({ id: ++uid, name: '', price: '', format: 'L', qty: '1' }, p || {}); }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var a = JSON.parse(raw);
        if (Array.isArray(a) && a.length) return a.slice(0, 200).map(function (r) {
          return newRow({ name: String(r.name || ''), price: String(r.price || ''), format: r.format === 'S' ? 'S' : 'L', qty: String(r.qty || '1') });
        });
      }
    } catch (e) {}
    return [newRow()];
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(rows.map(function (r) { return { name: r.name, price: r.price, format: r.format, qty: r.qty }; }))); } catch (e) {}
  }

  // ---------------------------------------------------------------- rows
  var ICON_DUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>';
  var ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };

  function rowHtml(r) {
    return '<div class="row" data-id="' + r.id + '">' +
      '<div class="cell name"><label for="n' + r.id + '">Назва товару</label><input type="text" id="n' + r.id + '" data-f="name" value="' + esc(r.name) + '" placeholder="Наприклад: Чіабата" maxlength="60" autocomplete="off"></div>' +
      '<div class="cell price"><label for="p' + r.id + '">Ціна, грн</label><input type="tel" inputmode="numeric" class="num" id="p' + r.id + '" data-f="price" value="' + esc(r.price) + '" placeholder="69" maxlength="5" autocomplete="off"></div>' +
      '<div class="cell fmt"><label>Формат</label><div class="seg" role="group" aria-label="Формат цінника">' +
        '<button type="button" data-f="format" data-v="L" aria-pressed="' + (r.format === 'L') + '">Великий</button>' +
        '<button type="button" data-f="format" data-v="S" aria-pressed="' + (r.format === 'S') + '">Малий</button></div></div>' +
      '<div class="cell qty"><label for="q' + r.id + '">Кількість</label><input type="tel" inputmode="numeric" class="num" id="q' + r.id + '" data-f="qty" value="' + esc(r.qty) + '" maxlength="3" autocomplete="off"></div>' +
      '<div class="actions"><button type="button" class="icon-btn" data-act="dup" title="Дублювати" aria-label="Дублювати рядок">' + ICON_DUP + '</button>' +
      '<button type="button" class="icon-btn" data-act="del" title="Видалити" aria-label="Видалити рядок">' + ICON_DEL + '</button></div>' +
      '<p class="err" hidden></p></div>';
  }
  function renderRows() { $('rows').innerHTML = rows.map(rowHtml).join(''); refresh(); }

  // ---------------------------------------------------------------- validation display
  function errorsByRow(res) {
    var m = {};
    res.errors.forEach(function (e) { if (e.row >= 0) (m[e.row] = m[e.row] || []).push(e); });
    return m;
  }
  function paintErrors(res) {
    var m = errorsByRow(res);
    var nodes = $('rows').children;
    for (var i = 0; i < nodes.length; i++) {
      var r = rows[i], el = nodes[i], list = m[i] || [];
      var started = r.name.trim() || r.price.trim();
      var shown = list.filter(function (e) {
        if (showAll) return true;
        if (!started) return false;
        if (e.field === 'name') return !!r.name.trim();          // long / bad characters while typing
        if (e.field === 'price') return !!r.price.trim();
        if (e.field === 'qty') return !!String(r.qty).trim();
        return false;
      });
      var fields = {};
      shown.forEach(function (e) { fields[e.field] = true; });
      ['name', 'price', 'qty'].forEach(function (f) {
        var inp = el.querySelector('[data-f="' + f + '"]'); if (inp) inp.classList.toggle('bad', !!fields[f]);
        if (inp) inp.setAttribute('aria-invalid', fields[f] ? 'true' : 'false');
      });
      el.querySelector('.seg').classList.toggle('bad', !!fields.format);
      var p = el.querySelector('.err');
      p.hidden = !shown.length;
      p.textContent = shown.map(function (e) { return e.message; }).join('. ');
    }
  }

  // ---------------------------------------------------------------- summary + preview
  var previewTimer = 0;
  function refresh() {
    save();
    var res = G.plan(rows);
    paintErrors(res.ok ? { errors: [] } : res);
    // rows that are valid right now (ignore the unfinished ones) drive the numbers and the preview
    var good = rows.filter(function (r, i) { return !errorsByRow(res)[i]; });
    var live = G.plan(good);
    var s = live.ok ? live.summary : { tags: 0, sheets: 0, perFormat: { L: 0, S: 0 } };
    $('s-tags').textContent = s.tags; $('s-sheets').textContent = s.sheets;
    $('s-l').textContent = s.perFormat.L; $('s-s').textContent = s.perFormat.S;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () { renderPreview(live.ok ? live : null); }, 120);
  }
  var MAX_PREVIEW = 6;
  function renderPreview(live) {
    var box = $('preview');
    if (!live || !live.sheets.length) {
      box.innerHTML = '<div class="empty">Додайте товар, і тут з’явиться розкладка аркушів A4: великих цінників по шість на аркуші, малих по вісім.</div>';
      return;
    }
    var html = PV.defsSvg() + '<div class="sheets">';
    live.sheets.slice(0, MAX_PREVIEW).forEach(function (sh, i) {
      html += '<figure><div class="paper">' + PV.sheetSvg(sh) + '</div><figcaption>Аркуш ' + (i + 1) + ' з ' + live.sheets.length + ' · ' +
        C.formats[sh.format].label + ' · ' + sh.tags.length + ' з ' + L.capacity(sh.format) + '</figcaption></figure>';
    });
    html += '</div>';
    if (live.sheets.length > MAX_PREVIEW) html += '<p class="more">Показано перші ' + MAX_PREVIEW + ' аркушів. У PDF будуть усі ' + live.sheets.length + '.</p>';
    box.innerHTML = html;
  }

  // ---------------------------------------------------------------- PDF
  async function deflate(u8) {
    if (typeof CompressionStream === 'function') {
      var cs = new CompressionStream('deflate');
      var w = cs.writable.getWriter(); w.write(u8); w.close();
      return new Uint8Array(await new Response(cs.readable).arrayBuffer());
    }
    // fallback: zlib container with stored (uncompressed) blocks
    var out = [0x78, 0x01], a = 1, b = 0, i, n = u8.length, pos = 0;
    for (i = 0; i < n; i++) { a = (a + u8[i]) % 65521; b = (b + a) % 65521; }
    var parts = [new Uint8Array(out)];
    do {
      var len = Math.min(65535, n - pos), last = pos + len >= n ? 1 : 0;
      var h = new Uint8Array([last, len & 255, len >> 8, (~len) & 255, ((~len) >> 8) & 255]);
      parts.push(h, u8.subarray(pos, pos + len)); pos += len;
    } while (pos < n);
    var ad = ((b << 16) | a) >>> 0;
    parts.push(new Uint8Array([ad >>> 24, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255]));
    var total = parts.reduce(function (t, p) { return t + p.length; }, 0), res = new Uint8Array(total), o = 0;
    parts.forEach(function (p) { res.set(p, o); o += p.length; });
    return res;
  }

  async function saveFile(name, bytes) {
    var dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name, data: bytes }); return 'saved'; }
      catch (e) { if (e && e.code === 'declined') return 'declined'; throw e; }
    }
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 15000);
    return 'saved';
  }

  function status(msg, kind) { var s = $('status'); s.textContent = msg; s.className = 'status' + (kind ? ' ' + kind : ''); }
  function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }
  var busy = false;
  async function onGenerate() {
    if (busy) return;
    showAll = true;
    var res = G.plan(rows);
    paintErrors(res.ok ? { errors: [] } : res);
    if (!res.ok) {
      var first = res.errors.filter(function (e) { return e.row >= 0; })[0];
      status(first ? 'Перевірте виділені рядки.' : res.errors[0].message, 'err');
      if (first) { var inp = $('rows').children[first.row].querySelector('[data-f="' + first.field + '"]'); if (inp && inp.focus) inp.focus(); }
      else if (res.errors[0]) { /* empty list */ }
      return;
    }
    busy = true; $('gen').disabled = true; status('Формую PDF…');
    try {
      var t0 = performance.now();
      var out = await G.generate(rows, deflate, {});
      var r = await saveFile('cinnyky_' + stamp() + '.pdf', out.pdf);
      var sec = ((performance.now() - t0) / 1000).toFixed(1);
      if (r === 'saved') status('PDF готовий: ' + out.summary.tags + ' цінників на ' + out.summary.sheets + ' арк. (' + sec + ' с).', 'ok');
      else status('Збереження скасовано.');
    } catch (e) {
      status('Не вдалося сформувати PDF. Спробуйте ще раз.', 'err');
      if (window.console) console.error(e);
    } finally { busy = false; $('gen').disabled = false; }
  }
  async function onCalib() {
    try {
      var bytes = await G.buildCalibrationPdf(deflate);
      var r = await saveFile('kalibruvannia_A4.pdf', bytes);
      if (r === 'saved') status('Тестовий аркуш готовий. Надрукуйте при 100% і виміряйте лінійкою лінію 100 мм.', 'ok');
    } catch (e) { status('Не вдалося створити тестовий аркуш.', 'err'); }
  }

  // ---------------------------------------------------------------- events
  $('rows').addEventListener('input', function (e) {
    var t = e.target, f = t.getAttribute && t.getAttribute('data-f'); if (!f) return;
    var row = rows.filter(function (r) { return r.id == t.closest('.row').getAttribute('data-id'); })[0];
    if (!row) return;
    var v = t.value;
    if (f === 'price' || f === 'qty') { var c = v.replace(/[^\d]/g, ''); if (c !== v) { t.value = c; v = c; } }
    row[f] = v; refresh();
  });
  $('rows').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var rowEl = b.closest('.row'); var id = rowEl.getAttribute('data-id');
    var i = rows.findIndex(function (r) { return r.id == id; });
    if (b.getAttribute('data-f') === 'format') { rows[i].format = b.getAttribute('data-v'); renderRows(); return; }
    var act = b.getAttribute('data-act');
    if (act === 'del') { rows.splice(i, 1); if (!rows.length) rows.push(newRow()); renderRows(); }
    if (act === 'dup') { rows.splice(i + 1, 0, newRow({ name: rows[i].name, price: rows[i].price, format: rows[i].format, qty: rows[i].qty })); renderRows(); }
  });
  $('add').addEventListener('click', function () {
    var last = rows[rows.length - 1];
    rows.push(newRow({ format: last ? last.format : 'L' })); renderRows();
    var n = $('rows').lastElementChild.querySelector('[data-f="name"]'); if (n) n.focus();
  });
  $('example').addEventListener('click', function () {
    rows = [newRow({ name: 'Чіабата', price: '69', format: 'L', qty: '9' }), newRow({ name: 'Трубочки', price: '35', format: 'S', qty: '8' }), newRow({ name: 'Паніні', price: '89', format: 'L', qty: '3' })];
    showAll = false; status(''); renderRows();
  });
  $('clear').addEventListener('click', function () { rows = [newRow()]; showAll = false; status(''); renderRows(); });
  $('gen').addEventListener('click', onGenerate);
  $('calib').addEventListener('click', onCalib);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.getAttribute && e.target.getAttribute('data-f') === 'qty') { e.preventDefault(); $('add').click(); } });

  $('logo').innerHTML = PV.logoSvg(A, 52);
  rows = load();
  renderRows();
  window.__gofood = { plan: function () { return G.plan(rows); }, rows: function () { return rows; } };
})();
