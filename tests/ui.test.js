/* Browser run-through of the real app at phone size: first launch, a 301 leg, the paywall,
   a full 18-hole golf round, an edit, and persistence across a reload.
   Run with: npm run test:ui   (uses the Playwright already on the machine) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'www');
const SHOTS = process.env.SHOTS_DIR || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, () => resolve(srv));
  });
}

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const text = (sel) => page.locator(sel).innerText();
  const num = (n) => page.locator(`#nums button[data-n="${n}"]`).click();
  const treble = async (n) => { await page.click('#mod3'); await num(n); };
  const dbl = async (n) => { await page.click('#mod2'); await num(n); };
  const golf = async (score) => { await page.click(`#gkeys button[data-s="${score}"]`); await page.click('#gkeep'); };
  let step = '';
  const check = (name, fn) => { step = name; return fn(); };

  try {
    /* first launch opens Settings for the player names */
    await page.goto(base);
    await check('first launch shows settings', async () => {
      await page.waitForSelector('#setSheet:not([hidden])');
      await page.fill('#name0', 'Dan'); await page.fill('#name1', 'Matt');
      await shot('1-settings');
      await page.click('#setSheet [data-close]');
      assert.match(await text('#players'), /Dan[\s\S]*Matt/);
    });

    /* 301: a 180, a bust, then a finish on a double */
    await check('180 scores and passes the throw', async () => {
      await treble(20); await treble(20); await treble(20);
      assert.match(await text('#players'), /121/);
      assert.match(await text('#bnb'), /180!/);
      assert.ok(await page.locator('#tabs').isHidden(), 'game selector goes once play starts');
      assert.ok(await page.locator('#starter').isHidden());
      assert.match(await text('#hint'), /Matt to throw/);
    });
    await check('opponent turn', async () => {
      await page.click('#kmiss'); await page.click('#kmiss'); await num(1);
      assert.match(await text('#players'), /300/);
      assert.match(await text('#hint'), /Dan can go out/);
    });
    await check('bust reverts the turn', async () => {
      await treble(20); await treble(20); // 121 -> 61 -> 1 cannot be finished on a double, so it is a bust
      assert.match(await text('#hint'), /Bust\. Dan stays on 121/);
      assert.match(await text('#players'), /121/);
    });
    await check('undo takes the bust back', async () => {
      await page.click('#kundo');
      assert.match(await text('#slots'), /T20/);
      assert.match(await text('#players'), /61/);
      await page.click('#kundo');
      assert.match(await text('#players'), /121/);
    });
    await check('checkout wins the leg', async () => {
      await treble(20); await treble(15); await dbl(8); // 121 = T20 T15 D8
      await page.waitForSelector('#win:not([hidden])');
      assert.match(await text('#win'), /Dan takes the leg/i);
      assert.match(await text('#hist'), /out in 6 darts/);
      await shot('2-leg-won');
    });

    /* Golf is behind the paywall */
    await check('golf opens the paywall when not subscribed', async () => {
      await page.click('#openSet'); await page.click('#gsG'); // mid-game the selector lives in Settings
      await page.waitForSelector('#paySheet:not([hidden])');
      assert.match(await text('#paySheet'), /Available in the iOS app/);
      assert.ok(await page.locator('#plans button').isDisabled(), 'no store in a browser');
      await shot('3-paywall');
      await page.click('#paySheet [data-close]');
      assert.ok(await page.locator('#vg').isHidden());
    });

    /* state survives a reload; ?pro=1 is the browser-only unlock */
    await check('state persists across reload', async () => {
      await page.goto(base + '?pro=1');
      await page.waitForSelector('#win:not([hidden])');
      assert.match(await text('#win'), /Dan takes the leg/i);
      assert.ok(await page.locator('#setSheet').isHidden(), 'settings only auto-open on first launch');
    });

    await check('golf round: honours, colours, edit', async () => {
      await page.click('#openSet'); await page.click('#gsG'); await page.click('#setSheet [data-close]');
      await page.waitForSelector('#vg:not([hidden])');
      assert.ok(await page.locator('#tabs').isVisible(), 'selector is back for a round that has not started');
      assert.match(await text('#ghint'), /Dan on hole 1/);
      await golf(0); await golf(-1);            // hole 1: Matt takes the lead
      assert.match(await text('#glead'), /Matt leads by 1/i);
      assert.match(await text('#ghint'), /Matt on hole 2/);
      // the score banner plays first, then the hole-change banner
      assert.match(await text('#bnb'), /Birdie/i);
      await page.waitForFunction(() => /Matt takes the lead[\s\S]*Matt to shoot first on hole 2/i.test(document.getElementById('bnb').innerText), null, { timeout: 4000 });
      await golf(2); await golf(-2);            // hole 2: Matt +2 (roast), Dan -2
      assert.match(await text('#glead'), /Dan leads by 3/i);
      assert.match(await text('#ghint'), /Dan on hole 3/);
      // three darts on a hole: only the last one counts, and it is kept automatically
      await page.click('#gkeys button[data-s="-3"]'); await page.click('#gkeys button[data-s="1"]'); await page.click('#gkeys button[data-s="0"]');
      assert.match(await text('#ghint'), /Matt on hole 3/);
      await golf(0);
      await shot('4-golf');
      // correct hole 1 for Dan from 0 to -1
      await page.click('#gcard td[data-p="0"][data-k="1"]');
      assert.match(await text('#ghint'), /Editing Dan, hole 1/);
      await page.click('#gkeys button[data-s="-1"]');
      assert.match(await text('#glead'), /Dan leads by 4/i);
      assert.equal(await page.locator('#gcard td.neg').count() > 0, true);
    });

    await check('golf round finishes with the ending sequence', async () => {
      for (let h = 4; h <= 18; h++) { await golf(-1); await golf(0); }
      assert.match(await text('#glead'), /Round complete/i);
      assert.ok(await page.locator('#gwin').isHidden(), 'result is held back for the reveal');
      await page.waitForSelector('#gwin:not([hidden])', { timeout: 8000 });
      assert.match(await text('#gwin'), /Dan wins by 19/i);
      assert.match(await text('#bnb'), /Dan wins/i);
      await shot('5-golf-won');
      assert.match(await text('#hist'), /18 holes/);
    });

    await check('undo reopens the round and removes it from the scoreboard', async () => {
      await page.click('#gwin [data-a="undo"]');
      assert.match(await text('#ghint'), /hole 18/);
      assert.doesNotMatch(await text('#hist'), /18 holes/);
    });

    await check('no horizontal page scroll at phone width', async () => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(over, 0);
    });

    assert.deepEqual(errors, [], 'no console errors');
    console.log('UI run-through passed');
  } catch (e) {
    console.error('FAILED at: ' + step + '\n' + (e.stack || e));
    if (errors.length) console.error('console errors:', errors);
    await shot('failure');
    process.exitCode = 1;
  } finally {
    await browser.close(); srv.close();
  }
})();
