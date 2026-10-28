'use strict';
// usage: node tools/make_pdf.js out.pdf  '<json rows>'
const fs = require('fs');
const zlib = require('zlib');
const { generate, buildCalibrationPdf } = require('../src');
const deflate = async (u8) => new Uint8Array(zlib.deflateSync(Buffer.from(u8), { level: 9 }));
(async () => {
  const [out, json] = process.argv.slice(2);
  if (out === '--calibration') {
    fs.writeFileSync(json, await buildCalibrationPdf(deflate));
    return;
  }
  const rows = JSON.parse(json);
  const r = await generate(rows, deflate, {});
  if (!r.ok) { console.error(JSON.stringify(r.errors)); process.exit(2); }
  fs.writeFileSync(out, r.pdf);
  console.log(out, r.pdf.length + ' bytes', JSON.stringify(r.summary));
})();
