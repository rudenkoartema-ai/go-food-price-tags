// Real-browser test: open the standalone page, fill the TZ example, click "Сформувати PDF", capture the download.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const out = path.join(__dirname, '..', 'build');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
  await page.waitForSelector('#rows .row');
  console.log('initial rows:', await page.locator('#rows .row').count());
  await page.screenshot({ path: out + '/ui-empty.png' });

  // type the first row by hand
  await page.fill('#rows .row:nth-child(1) [data-f="name"]', 'Чіабата');
  await page.fill('#rows .row:nth-child(1) [data-f="price"]', '69');
  await page.fill('#rows .row:nth-child(1) [data-f="qty"]', '9');
  await page.click('#add');
  await page.fill('#rows .row:nth-child(2) [data-f="name"]', 'Трубочки');
  await page.fill('#rows .row:nth-child(2) [data-f="price"]', '35');
  await page.click('#rows .row:nth-child(2) [data-f="format"][data-v="S"]');
  await page.fill('#rows .row:nth-child(2) [data-f="qty"]', '8');
  await page.click('#add');
  await page.fill('#rows .row:nth-child(3) [data-f="name"]', 'Паніні');
  await page.fill('#rows .row:nth-child(3) [data-f="price"]', '89');
  await page.click('#rows .row:nth-child(3) [data-f="format"][data-v="L"]');
  await page.fill('#rows .row:nth-child(3) [data-f="qty"]', '3');
  await page.waitForTimeout(400);
  console.log('summary:', await page.textContent('#s-tags'), 'tags,', await page.textContent('#s-sheets'), 'sheets, L', await page.textContent('#s-l'), 'S', await page.textContent('#s-s'));
  await page.screenshot({ path: out + '/ui-filled.png', fullPage: true });

  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#gen')]);
  const file = out + '/e2e_' + dl.suggestedFilename();
  await dl.saveAs(file);
  console.log('download:', dl.suggestedFilename(), fs.statSync(file).size, 'bytes');
  await page.waitForTimeout(300);
  console.log('status:', await page.textContent('#status'));

  // validation: empty name must be flagged and block generation
  await page.click('#clear');
  await page.fill('#rows .row:nth-child(1) [data-f="price"]', '0');
  await page.click('#gen');
  await page.waitForTimeout(200);
  console.log('error text:', await page.textContent('#rows .row:nth-child(1) .err'));
  await page.screenshot({ path: out + '/ui-error.png' });

  // phone width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#example');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/ui-phone.png', fullPage: true });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log('phone scrollWidth', sw, '(viewport 390)');
  console.log('console issues:', JSON.stringify(logs));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
