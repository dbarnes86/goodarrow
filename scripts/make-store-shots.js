/* Renders the App Store screenshots from the real app: six game states, each framed under a headline,
   in every iPhone size App Store Connect asks for. Run: npm run store-shots (needs Playwright).
   Output: resources/store/screenshots/<width>x<height>/
   With --play it renders the Google Play phone size instead (1080 x 2160; Play rejects anything taller than 2:1),
   to resources/store/play/screenshots/1080x2160/ */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'www');
const PLAY = process.argv.includes('--play');
const OUT = path.join(__dirname, '..', 'resources', 'store', ...(PLAY ? ['play', 'screenshots'] : ['screenshots']));
// Pixel sizes Apple accepts, as points at 3x: large display (6.9-inch) and medium display (6.3-inch, two variants).
const SIZES = PLAY ? [[360, 720]] : [[440, 956], [402, 874], [393, 852]];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const raw = {};   // name -> PNG buffer of the bare app screen

function serve() {
  return new Promise((r) => { const s = http.createServer((q, res) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url.startsWith('/raw/')) { const b = raw[url.slice(5, -4)]; res.writeHead(b ? 200 : 404, { 'content-type': 'image/png' }); return res.end(b); }
    const f = path.join(ROOT, url.replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0, () => r(s)); });
}
/* Stands in for the native plugins: live-style prices, and Pro on or off. */
function nativeStub(pro) {
  const pkg = (id, type, p) => ({ identifier: id, packageType: type, product: { title: id, priceString: '$' + p.toFixed(2), price: p } });
  const info = { customerInfo: { entitlements: { active: pro ? { good_arrow_pro: { isActive: true } } : {} } } };
  const plugins = {
    Preferences: { get: async () => ({ value: null }), set: async () => {} },
    Haptics: { impact: async () => {}, notification: async () => {} },
    Purchases: { configure: async () => {}, addCustomerInfoUpdateListener: async () => {}, getCustomerInfo: async () => info,
      getOfferings: async () => ({ current: { availablePackages: [pkg('$rc_monthly', 'MONTHLY', 0.99), pkg('$rc_annual', 'ANNUAL', 7.99), pkg('$rc_lifetime', 'LIFETIME', 19.99)] } }) },
    RevenueCatUI: {}
  };
  window.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => plugins[n] };
  Math.random = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();   // same Killer numbers every run
}

const SHOTS = [
  { name: '1-games', title: 'Twelve games.<br>One app.', sub: 'From 301 to Killer, every score done for you' },
  { name: '2-checkout', title: 'Every checkout,<br>called', sub: 'Busts spotted, finishes suggested, turns passed' },
  { name: '3-golf', title: 'Golf, scored<br>against par', sub: 'A live scorecard with honours on every hole' },
  { name: '4-killer', title: 'Up to six<br>at the board', sub: 'Lives, killers and turn order kept for you' },
  { name: '5-win', title: 'Make the winner<br>feel it', sub: 'Celebrations for the big moments, and a record of who wins' },
  { name: '6-pro', title: 'Unlock<br>every game', sub: 'Ten more games with Good Arrows Pro' }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();

  async function app(pro) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { throw e; });
    await page.route('**/vendor/capacitor.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(nativeStub, pro);
    await page.goto(base);
    await page.waitForSelector('#playerSheet:not([hidden])');
    await page.fill('#plName', 'Dan'); await page.click('#playerSheet [data-close]');
    await page.click('#players [data-p="1"]'); await page.fill('#plName', 'Matt'); await page.click('#playerSheet [data-close]');
    await page.waitForFunction((p) => document.querySelectorAll('#games .gcard.locked').length === (p ? 0 : 10), pro);
    return page;
  }
  const add = async (page, name) => { await page.click('#players [data-p="add"]'); await page.fill('#plName', name); await page.click('#playerSheet [data-close]'); };
  const start = async (page, id, opt) => { await page.click(`#games [data-g="${id}"]`); await page.waitForSelector('#setupSheet:not([hidden])'); if (opt) await page.click(opt); await page.click('#suStart'); await page.waitForSelector('#game:not([hidden])'); };
  const dart = async (page, n, m) => { if (m > 1) await page.click(`#pad [data-m="${m}"]`); await page.click(`#pad [data-n="${n}"]`); };
  const pb = (page, label) => page.click(`#pad .pb:has(b:text-is("${label}"))`);
  const quiet = (page) => page.waitForFunction(() => document.getElementById('bn').hidden, null, { timeout: 15000 });
  const grab = async (page, name) => { await page.waitForTimeout(300); raw[name] = await page.screenshot(); };

  /* free user: lobby and paywall */
  let page = await app(false);
  await add(page, 'Sam'); await add(page, 'Jess');
  await page.evaluate(() => { document.querySelector('#lobby .scroll').scrollTop = 0; });
  await grab(page, '1-games');
  await page.click('#games [data-g="golf"]'); await page.waitForSelector('#plans .plan >> nth=2'); await page.waitForTimeout(500);
  await grab(page, '6-pro');
  await page.context().close();

  /* Pro: games in play */
  page = await app(true);
  await start(page, 'x01');
  await dart(page, 20, 3); await dart(page, 20, 3); await dart(page, 20, 3);        // Dan 180 -> 121
  await dart(page, 20, 3); await dart(page, 19, 3); await dart(page, 18, 1);        // Matt 135 -> 166
  await quiet(page); await grab(page, '2-checkout');

  await page.click('#toLobby'); await add(page, 'Sam'); await add(page, 'Jess');
  await start(page, 'golf', '#suHolesSeg [data-v="18"]');
  const holes = [[0, -1, 1, 0], [-2, 0, 0, 1], [-1, -1, 2, 0], [0, -3, 0, -1], [1, 0, -1, 0], [-1, 0, 0, 1]];
  for (const h of holes) for (let k = 0; k < 4; k++) {
    const who = await page.evaluate(() => [...document.querySelectorAll('#board tr.on .nm')].map((e) => e.textContent)[0]);
    const idx = ['Dan', 'Matt', 'Sam', 'Jess'].indexOf(who), s = h[idx];
    await pb(page, s > 0 ? '+' + s : '' + s); await page.click('#pad [data-a="keep"]');
  }
  await quiet(page); await grab(page, '3-golf');

  await page.click('#toLobby'); await start(page, 'killer');
  const killerTurn = async (plan) => { for (const p of plan) { if (p === 'miss') await page.click('#pad .pb.miss'); else if (p === 'own') await page.click('#pad .pb.own'); else await page.click(`#pad .pb.foe >> nth=${p}`); } };
  await killerTurn(['own', 'miss', 'miss']);   // Dan arms
  await killerTurn(['miss', 'own', 'miss']);   // Matt arms
  await killerTurn(['miss', 'miss', 'miss']);  // Sam
  await killerTurn(['own', 'miss', 'miss']);   // Jess arms
  await killerTurn([0, 0, 'miss']);            // Dan takes two from Matt
  await killerTurn([1, 'miss', 'miss']);       // Matt hits someone
  await quiet(page); await grab(page, '4-killer');

  await page.click('#toLobby'); await start(page, 'countup');
  for (let r = 0; r < 8; r++) for (let p = 0; p < 4; p++) for (let d = 0; d < 3; d++) await dart(page, [20, 19, 18, 17][p] - (r % 3), d === 0 && p === 0 ? 3 : 1);
  await page.waitForSelector('#bn.win', { timeout: 8000 }); await page.waitForTimeout(1900);
  await page.evaluate(() => { document.getElementById('bn').style.visibility = 'hidden'; });   // the scores, the result and the confetti, without the banner over them
  raw['5-win'] = await page.screenshot();
  await page.context().close();

  /* frame each screen under its headline */
  for (const [W, H] of SIZES) {
  const dir = path.join(OUT, (W * 3) + 'x' + (H * 3)); fs.mkdirSync(dir, { recursive: true });
  const frame = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3 })).newPage();
  for (const s of SHOTS) {
    await frame.goto(base + 'index.html');   // for the fonts; the body is replaced below
    await frame.setContent(`<!doctype html><html><head><base href="${base}"><style>
      @font-face{font-family:BS;font-weight:800;src:url(fonts/big-shoulders-display-latin-800-normal.woff2)}
      @font-face{font-family:FT;font-weight:600;src:url(fonts/figtree-latin-600-normal.woff2)}
      html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
      body{background:radial-gradient(130% 70% at 50% 0%,#1D3F96 0%,#0B1530 52%,#070B16 100%);color:#F5F7FF;font-family:FT,sans-serif;position:relative}
      .ring{position:absolute;left:50%;top:-250px;width:620px;height:620px;margin-left:-310px;border-radius:50%;border:1px solid #ffffff14;box-shadow:0 0 0 60px #ffffff06,0 0 0 120px #ffffff04}
      header{position:relative;padding:50px 28px 0;text-align:center}
      h1{margin:0;font-family:BS;font-weight:800;font-size:46px;line-height:.95;letter-spacing:.01em;text-transform:uppercase}
      p{margin:12px auto 0;font-size:15.5px;line-height:1.35;color:#C6D6FF;max-width:330px}
      .phone{position:absolute;left:50%;top:230px;width:340px;margin-left:-170px;border-radius:44px;padding:9px;background:#1A2340;box-shadow:0 0 0 1.5px #3A4A78,0 30px 80px rgba(0,0,0,.6),0 0 90px rgba(47,123,255,.28)}
      .phone img{display:block;width:100%;border-radius:36px}
    </style></head><body><div class="stage" style="position:absolute;left:0;top:0;width:440px;height:956px;transform:scale(${W / 440});transform-origin:0 0"><div class="ring"></div><header><h1>${s.title}</h1><p>${s.sub}</p></header><div class="phone"><img src="raw/${s.name}.png"></div></div></body></html>`);
    await frame.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
    await frame.screenshot({ path: path.join(dir, s.name + '.png') });
  }
  await frame.context().close();
  }
  await browser.close(); srv.close();
  console.log('wrote ' + SHOTS.length + ' screenshots in ' + SIZES.length + ' sizes to ' + path.relative(path.join(__dirname, '..'), OUT));
})().catch((e) => { console.error(e); process.exit(1); });
