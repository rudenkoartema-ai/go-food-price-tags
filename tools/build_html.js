'use strict';
// Bundles src/*.js + ui/* into a single self-contained page.
//   dist/artifact.html : page content for the Artifact tool (no doctype/head/body)
//   dist/index.html    : standalone page (Render static site / open from disk)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mods = ['config', 'path', 'text', 'assets', 'scene', 'layout', 'validate', 'pdf', 'preview', 'index'];

let js = "var __m={};function __def(n,f){__m[n]={f:f,e:null}}function __req(n){n=n.replace(/^\\.\\//,'').replace(/\\.js$/,'');var m=__m[n];if(!m)throw new Error('module '+n);if(!m.e){m.e={exports:{}};m.f(m.e,m.e.exports,__req)}return m.e.exports}\n";
for (const m of mods) {
  const src = fs.readFileSync(path.join(root, 'src', m + '.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  js += `__def(${JSON.stringify(m)},function(module,exports,require){\n${src}\n});\n`;
}
js += fs.readFileSync(path.join(root, 'ui', 'app.js'), 'utf8');

const css = fs.readFileSync(path.join(root, 'ui', 'style.css'), 'utf8');
const body = fs.readFileSync(path.join(root, 'ui', 'body.html'), 'utf8');
const title = 'Генератор цінників GO FOOD';
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">';

const artifact = `<title>${title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}</style>\n${body}<script>\n${js}\n</script>\n`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), artifact);
const standalone = `<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${artifact.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')}</head>\n</html>\n`
  // keep body content in <body>: move everything after </style> into body
  ;
const idx = artifact.indexOf('</style>') + '</style>\n'.length;
const head = artifact.slice(0, idx).replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '');
const rest = artifact.slice(idx);
fs.writeFileSync(path.join(root, 'dist', 'index.html'),
  `<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}</head>\n<body>\n${rest}</body>\n</html>\n`);
console.log('artifact.html', (artifact.length / 1024).toFixed(0) + ' KB');
