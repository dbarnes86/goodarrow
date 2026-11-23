/* Browser run-through of the real app at phone size: first launch, the lobby, the paywall,
   a 301 leg, and one game of each input style, plus persistence across a reload.
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const text = (sel) => page.locator(sel).innerText();
  const has = (sel, re, timeout = 6000) => page.waitForFunction(([s, src, fl]) => { const el = document.querySelector(s); return el && new RegExp(src, fl).test(el.innerText); }, [sel, re.source, re.flags], { timeout });
  const num = (n) => page.click(`#pad [data-n="${n}"]`);
  const treble = async (n) => { await page.click('#pad [data-m="3"]'); await num(n); };
  const dbl = async (n) => { await page.click('#pad [data-m="2"]'); await num(n); };
  const miss = () => page.click('#pad [data-x="miss"]');
  const pb = (label) => page.click(`#pad .pb:has(b:text-is("${label}"))`);
  const golf = async (label) => { await pb(label); await page.click('#pad [data-a="keep"]'); };
  const start = async (id) => { await page.click(`#games [data-g="${id}"]`); await page.waitForSelector('#setupSheet:not([hidden])'); await page.click('#suStart'); await page.waitForSelector('#game:not([hidden])'); };
  const rename = async (i, name) => { await page.click(`#players [data-p="${i}"]`); await page.fill('#plName', name); await page.click('#playerSheet [data-close]'); };
  let step = '';
  const check = (name, fn) => { step = name; return fn(); };

  try {
    await page.goto(base);
    await check('first launch asks for a name, then shows the lobby', async () => {
      await page.waitForSelector('#playerSheet:not([hidden])');
      await page.fill('#plName', 'Dan'); await page.click('#playerSheet [data-close]');
      await rename(1, 'Matt');
      assert.match(await text('#players'), /Dan[\s\S]*Matt/);
      assert.equal(await page.locator('#games .gcard').count(), 12);
      assert.equal(await page.locator('#games .gcard.locked').count(), 10, 'ten Pro games');
      await shot('1-lobby');
    });

    await check('a Pro game opens the paywall with three plans', async () => {
      await page.click('#games [data-g="killer"]');
      await page.waitForSelector('#paySheet:not([hidden])');
      assert.match(await text('#payTitle'), /Unlock Killer/i);
      assert.equal(await page.locator('#plans .plan').count(), 3);
      assert.match(await text('#plans'), /Monthly[\s\S]*Yearly[\s\S]*Save \d+%[\s\S]*Lifetime/i);
      assert.equal(await page.locator('#plans .plan[aria-checked="true"]').count(), 1);
      assert.ok(await page.locator('#payBuy').isDisabled(), 'no store in a browser');
      await page.waitForTimeout(450);   // let the sheet finish sliding up before measuring
      const seen = await page.evaluate(() => { const r = (id) => document.querySelector(id).getBoundingClientRect(); const top = document.querySelector('#paySheet .panel').getBoundingClientRect().top;
        return { cta: r('#payBuy').bottom <= innerHeight, plans: r('#plans').bottom <= r('.payfoot').top + 1 && r('#plans').top >= top, links: r('#payRestore').bottom <= innerHeight }; });
      assert.deepEqual(seen, { cta: true, plans: true, links: true }, 'plans, Continue and Restore are all on screen without scrolling');
      assert.match(await text('#payLinks'), /Terms of use/);
      await shot('2-paywall');
      await page.click('#paySheet [data-close]');
      assert.ok(await page.locator('#game').isHidden());
    });

    await check('301: a 180, then the throw passes', async () => {
      await start('x01');
      await treble(20); await treble(20); await treble(20);
      assert.match(await text('#bnb'), /180!/);
      await has('#cards', /121/);
      assert.match(await text('#hint'), /Matt to throw/);
      assert.ok(await page.locator('#cards .pc').nth(1).evaluate((e) => e.classList.contains('on')));
    });
    await check('301: bust, undo, checkout', async () => {
      await miss(); await miss(); await num(1);
      assert.match(await text('#hint'), /Dan can go out/);
      await treble(20); await treble(20);          // 121 -> 61 -> 1 cannot be finished on a double
      assert.match(await text('#hint'), /Bust\. Dan stays on 121/);
      await page.click('#pad [data-a="undo"]'); await page.click('#pad [data-a="undo"]');
      await has('#cards', /121/);
      await treble(20); await treble(15); await dbl(8);
      await page.waitForSelector('#result:not([hidden])');
      assert.match(await text('#result'), /Winner[\s\S]*Dan[\s\S]*out in 6 darts/i);
      await shot('3-leg-won');
    });
    await check('next leg swaps the throw; the result is on the lobby', async () => {
      await page.click('#result [data-a="again"]');
      assert.match(await text('#hint'), /Matt to throw/); assert.match(await text('#gInfo'), /Leg 2/i);
      await page.click('#toLobby');
      assert.match(await text('#hist'), /301[\s\S]*Dan/);
      assert.ok(await page.locator('#resume').isHidden(), 'a leg nobody has thrown in is not "in progress"');
    });

    await check('count-up: eight rounds, drum roll, winner', async () => {
      await start('countup');
      for (let r = 0; r < 8; r++) { await num(20); await num(20); await num(20); await num(19); await num(19); await num(19); }
      assert.ok(await page.locator('#result').isHidden(), 'the result is held back for the reveal');
      await page.waitForSelector('#result:not([hidden])', { timeout: 9000 });
      assert.match(await text('#result'), /Dan[\s\S]*480[\s\S]*456/);
    });

    await check('a game in progress survives a reload and can be resumed or ended', async () => {
      await page.click('#result [data-a="again"]'); await num(5);
      await page.goto(base + '?pro=1');
      await page.waitForSelector('#game:not([hidden])');
      assert.match(await text('#gTitle'), /Count-Up/i); await has('#cards', /\b5\b/);
      await page.click('#toLobby');
      await page.waitForSelector('#resume:not([hidden])');
      assert.match(await text('#resume'), /In progress[\s\S]*Count-Up/i);
      assert.equal(await page.locator('#games .gcard.locked').count(), 0, 'Pro unlocks every game');
    });

    await check('golf: honours, last dart counts, edit, finish, undo', async () => {
      await page.click('#games [data-g="golf"]'); await page.waitForSelector('#setupSheet:not([hidden])');
      assert.match(await text('#suNote'), /ends the Count-Up game/i);
      await page.click('#suHolesSeg [data-v="9"]'); await page.click('#suStart');
      assert.match(await text('#hint'), /Dan on hole 1/);
      await golf('0'); await golf('-1');                          // hole 1: Matt leads
      await has('#lead', /Matt leads by 1/i); assert.match(await text('#hint'), /Matt on hole 2/);
      await has('#bnb', /Matt takes the lead[\s\S]*Matt to shoot first on hole 2/i);
      await golf('+2'); await golf('-2');                         // hole 2: Matt +1, Dan -2
      await has('#lead', /Dan leads by 3/i);
      await pb('-3'); await pb('+1'); await pb('0');              // three darts: the last one is kept
      assert.match(await text('#hint'), /Matt on hole 3/);
      await golf('0');
      await page.click('#board td[data-p="0"][data-k="1"]');
      assert.match(await text('#hint'), /Editing Dan, hole 1/);
      await pb('-1');
      await has('#lead', /Dan leads by 4/i);
      await shot('4-golf');
      for (let h = 4; h <= 9; h++) { await golf('-1'); await golf('0'); }
      await has('#lead', /Round complete/i);
      await page.waitForSelector('#result:not([hidden])', { timeout: 9000 });
      assert.match(await text('#result'), /Dan[\s\S]*By 10 over 9 holes/i);
      await page.click('#result [data-a="undo"]');
      assert.match(await text('#hint'), /hole 9/);
    });

    await check('three players: killer is played from the pad to a finish', async () => {
      await page.click('#toLobby');
      await page.click('#players [data-p="add"]'); await page.fill('#plName', 'Sam'); await page.click('#playerSheet [data-close]');
      await start('killer');
      assert.equal(await page.locator('#cards .pc').count(), 3);
      await page.click('#pad .pb.own');                                   // Dan arms
      await has('#bnb', /Killer/i);
      for (let turn = 0; turn < 6 && await page.locator('#result').isHidden(); turn++) {
        const who = await text('#cards .pc.on .pn');
        for (let d = 0; d < 3 && await page.locator('#result').isHidden(); d++) {
          if (/Dan/.test(who) && await page.locator('#pad .pb.foe').count()) await page.click('#pad .pb.foe >> nth=0'); else await page.click('#pad .pb.miss');
        }
      }
      await page.waitForSelector('#result:not([hidden])');
      assert.match(await text('#result'), /Winner[\s\S]*Dan[\s\S]*Last one standing/i);
      await shot('5-killer');
    });

    await check('cricket draws the marks board and scores points', async () => {
      await page.click('#result [data-a="lobby"]'); await start('cricket');
      await treble(20); await treble(20); await num(19);
      await has('#board', /Dan\s*60/);
      assert.equal(await page.locator('#board td.m3').count(), 1); assert.equal(await page.locator('#board td.m1').count(), 1);
    });

    await check('around the clock uses a target and a hit button', async () => {
      await page.click('#toLobby'); await start('atc');
      assert.match(await text('#targetV'), /^1$/);
      await pb('Hit'); await pb('Miss'); await pb('Hit');
      await has('#cards', /3[\s\S]*2 of 21 done/);
    });

    await check('a game that needs two players says so', async () => {
      await page.click('#toLobby');
      for (const i of [2, 1]) { await page.click(`#players [data-p="${i}"]`); await page.click('#plRemove'); }
      await page.click('#games [data-g="knockout"]');
      await has('#toast', /needs at least 2 players/i);
      assert.ok(await page.locator('#setupSheet').isHidden());
    });

    await check('it behaves like an app: the page itself never scrolls, in the lobby, a sheet or a game', async () => {
      const over = () => page.evaluate(() => { const d = document.documentElement; return [d.scrollWidth - d.clientWidth, d.scrollHeight - d.clientHeight]; });
      const pageY = () => page.evaluate(() => window.scrollY + document.documentElement.scrollTop + document.body.scrollTop);
      assert.deepEqual(await over(), [0, 0], 'lobby');
      const listY = () => page.evaluate(() => document.querySelector('#lobby .scroll').scrollTop);
      await page.evaluate(() => { document.querySelector('#lobby .scroll').scrollTop = 120; });
      await page.click('#openSet');
      await page.mouse.move(195, 80); await page.mouse.wheel(0, 400); await page.mouse.wheel(0, -400);   // over the dimmed area
      await page.mouse.move(195, 700); await page.mouse.wheel(0, 2000); await page.mouse.wheel(0, 2000);  // over the sheet, past its end
      await page.waitForTimeout(150);
      assert.equal(await pageY(), 0, 'the screen behind a sheet stays put');
      assert.equal(await listY(), 120, 'and so does the list behind it');
      await page.click('#setSheet [data-close]');
      for (const g of ['bobs', 'x01', 'golf']) {
        await start(g); assert.deepEqual(await over(), [0, 0], g);
        const fits = await page.evaluate(() => { const b = [...document.querySelectorAll('#pad button')].pop().getBoundingClientRect(); const t = document.querySelector('.gtop'); return b.bottom <= innerHeight && t.scrollHeight - t.clientHeight <= 1; });
        assert.ok(fits, g + ' fits the screen with every key visible and nothing to scroll');
        await page.click('#toLobby');
      }
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
