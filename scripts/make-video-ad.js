/* Records a 30-second video ad, vertical (1080 x 1920) and landscape (1920 x 1080), from the real app: a 301 leg with a 180, a checkout
   called and hit, then the games list, inside a phone frame with captions and a closing card. The app runs in
   an iframe with the same stand-in native plugins as the store screenshots, and the page is captured frame by
   frame with Chrome's screencast, then encoded with ffmpeg (H.264, silent AAC track, 30 fps).
   Run: npm run video (needs Playwright and ffmpeg). Output: resources/store/video/good-arrows-30s-<width>x<height>.mp4 */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), WWW = path.join(ROOT, 'www');
const OUT = path.join(ROOT, 'resources', 'store', 'video');
const LENGTH = 30, APP = { w: 390, h: 844 };                    // seconds, and the app's viewport
/* Per shape: the frame size, how much the phone scales the app (S), where the app's top-left sits (x, y),
   and where the captions go. Vertical puts the captions above the phone; landscape puts them to its left. */
const FORMATS = [
  { W: 1080, H: 1920, S: 1.6, x: (1080 - APP.w * 1.6) / 2, y: 470, bg: '130% 70% at 50% 0%', h1: 112, p: 40, end: 1,
    cap: 'left:60px;right:60px;top:90px;height:340px;align-items:center;text-align:center' },
  { W: 1920, H: 1080, S: 1.1, x: 1250, y: 92, bg: '90% 140% at 72% 0%', h1: 150, p: 46, end: .82,
    cap: 'left:140px;width:980px;top:0;bottom:0;align-items:flex-start;text-align:left' }
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

const adPage = ({ W, H, S, x, y, bg, h1, p, end: e, cap }) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:BS;font-weight:800;src:url(/fonts/big-shoulders-display-latin-800-normal.woff2)}
  @font-face{font-family:FT;font-weight:600;src:url(/fonts/figtree-latin-600-normal.woff2)}
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#070B16}
  body{position:relative;color:#F5F7FF;font-family:FT,sans-serif;background:radial-gradient(${bg},#1D3F96 0%,#0B1530 52%,#070B16 100%)}
  #cap{position:absolute;${cap};display:flex;flex-direction:column;justify-content:center;gap:18px;transition:opacity .35s,transform .35s}
  #cap.out{opacity:0;transform:translateY(-24px)}
  #cap h1{margin:0;font-family:BS;font-weight:800;font-size:${h1}px;line-height:.92;text-transform:uppercase;letter-spacing:.01em}
  #cap p{margin:0;font-size:${p}px;color:#C6D6FF}
  #phone{position:absolute;left:${x - 16}px;top:${y - 16}px;width:${APP.w * S + 32}px;height:${APP.h * S + 32}px;border-radius:${Math.round(49 * S)}px;background:#1A2340;
    box-shadow:0 0 0 2px #3A4A78,0 40px 120px rgba(0,0,0,.6),0 0 140px rgba(47,123,255,.3);transition:transform .9s cubic-bezier(.2,.8,.2,1),opacity .9s}
  #phone.low{transform:translateY(420px);opacity:0}
  #screen{position:absolute;left:16px;top:16px;width:${APP.w * S}px;height:${APP.h * S}px;border-radius:${Math.round(40 * S)}px;overflow:hidden}
  #screen iframe{border:0;width:${APP.w}px;height:${APP.h}px;transform:scale(${S});transform-origin:0 0;display:block}
  .tap{position:absolute;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;background:rgba(255,255,255,.35);box-shadow:0 0 0 3px rgba(255,255,255,.7);pointer-events:none;animation:tap .45s ease-out forwards}
  @keyframes tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.3);opacity:0}}
  #end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center;
    background:radial-gradient(120% 80% at 50% 30%,#1D3F96 0%,#0B1530 55%,#070B16 100%);opacity:0;transition:opacity .6s}
  #end.on{opacity:1}
  #end img{width:${300 * e}px;height:${300 * e}px;border-radius:${66 * e}px;box-shadow:0 0 120px rgba(47,123,255,.45)}
  #end h1{margin:0;font-family:BS;font-weight:800;font-size:${150 * e}px;line-height:.9;text-transform:uppercase}
  #end p{margin:0;font-size:${46 * e}px;color:#C6D6FF}
  #end .get{margin-top:${24 * e}px;padding:${26 * e}px ${56 * e}px;border-radius:999px;background:#2F7BFF;font-size:${46 * e}px;color:#fff}
</style></head><body>
  <div id="cap" class="out"><h1></h1><p></p></div>
  <div id="phone" class="low"><div id="screen"><iframe src="/index.html"></iframe></div></div>
  <div id="end"><img src="/__icon.png"><h1>Good Arrows</h1><p>Twelve darts games, one to six players</p><p>Free to download. No ads.</p><div class="get">Get it on Google Play</div></div>
  <script>
    window.cap = function (h, p) {
      var c = document.getElementById('cap'); c.classList.add('out');
      setTimeout(function () { c.querySelector('h1').innerHTML = h; c.querySelector('p').textContent = p || ''; c.classList.remove('out'); }, 350);
    };
    window.tapAt = function (x, y) { var d = document.createElement('div'); d.className = 'tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 600); };
  </script>
</body></html>`;

function serve(html) {
  return new Promise((r) => { const s = http.createServer((q, res) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__ad') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html); }
    if (url === '/__icon.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(fs.readFileSync(path.join(ROOT, 'resources', 'store', 'play', 'icon-512.png'))); }
    if (url === '/vendor/capacitor.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(''); }
    const f = path.join(WWW, url.replace(/^\/$/, '/index.html'));
    if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0, () => r(s)); });
}

/* Stands in for the native plugins inside the app frame, as in make-store-shots.js: a free user with live-style prices. */
function nativeStub() {
  if (window.top === window) return;   // only the app frame
  const pkg = (id, type, p) => ({ identifier: id, packageType: type, product: { title: id, priceString: '$' + p.toFixed(2), price: p } });
  const plugins = {
    Preferences: { get: async () => ({ value: null }), set: async () => {} },
    Haptics: { impact: async () => {}, notification: async () => {} },
    Purchases: { configure: async () => {}, addCustomerInfoUpdateListener: async () => {}, getCustomerInfo: async () => ({ customerInfo: { entitlements: { active: {} } } }),
      getOfferings: async () => ({ current: { availablePackages: [pkg('$rc_monthly', 'MONTHLY', 0.99), pkg('$rc_annual', 'ANNUAL', 7.99), pkg('$rc_lifetime', 'LIFETIME', 19.99)] } }) },
    RevenueCatUI: {}
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: (n) => plugins[n] };
  Math.random = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function record(f) {
  const { W, H, S } = f, PH = { x: f.x, y: f.y }, FILE = path.join(OUT, `good-arrows-30s-${W}x${H}.mp4`);
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-video-'));
  const srv = await serve(adPage(f)), base = `http://localhost:${srv.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(nativeStub);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(base + '/__ad');
  const app = page.frames().find((f) => f.url().endsWith('/index.html'));

  /* Tap an element in the app: show a touch ring where a finger would land, then click it. */
  async function tap(sel, hold) {
    const r = await app.locator(sel).first().evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.evaluate(([x, y]) => window.tapAt(x, y), [PH.x + r.x * S, PH.y + r.y * S]);
    await wait(90);
    await app.locator(sel).first().evaluate((el) => el.click());
    await wait(hold == null ? 260 : hold);
  }
  const dart = async (n, m) => { if (m > 1) await tap(`#pad [data-m="${m}"]`, 160); await tap(`#pad [data-n="${n}"]`, 380); };
  const cap = (h, p) => page.evaluate(([a, b]) => window.cap(a, b), [h, p]);

  // Set-up, before recording: two players.
  await app.waitForSelector('#playerSheet:not([hidden])');
  const press = (sel) => app.locator(sel).first().evaluate((el) => el.click());   // the frame is scaled, so click in the page itself
  await app.fill('#plName', 'Dan'); await press('#playerSheet [data-close]');
  await press('#players [data-p="1"]'); await app.fill('#plName', 'Matt'); await press('#playerSheet [data-close]');
  await app.evaluate(() => document.fonts.ready);
  await wait(400);

  // Record: Chrome sends a frame whenever the page changes, each with its timestamp.
  const cdp = await ctx.newCDPSession(page), stamps = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(frames, String(stamps.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    stamps.push({ file, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now(), at = async (s) => { const ms = s * 1000 - (Date.now() - t0); if (ms > 0) await wait(ms); };

  // 0s: the hook.
  await page.evaluate(() => document.getElementById('phone').classList.remove('low'));
  await cap('Stop doing<br>the maths', 'Darts scoring, done for you');
  await at(2.6);
  await tap('#games [data-g="x01"]', 500);
  await tap('#suStart', 600);

  // 4s: a 180.
  await cap('Tap what<br>you hit', 'Big keys. Dart still in hand.');
  await at(4.6);
  await dart(20, 3); await dart(20, 3); await dart(20, 3);
  await at(9.6);

  // 10s: the checkout, called and hit.
  await cap('Every checkout,<br>called', 'Busts spotted. Finishes suggested.');
  await dart(20, 3); await dart(19, 3); await dart(18, 1);
  await at(14.2);
  await dart(20, 3); await dart(7, 3); await dart(20, 2);
  await cap('Game shot!', 'Every result kept');
  await at(19.8);

  // 20s: the games, by the winner card's own All games button.
  await tap('[data-a="lobby"]', 0);
  await cap('Twelve games.<br>Up to six players.', '301, Cricket, Killer, Golf and more');
  await wait(700);
  await app.evaluate(() => new Promise((done) => {
    const el = document.querySelector('#lobby .scroll'), to = el.scrollHeight - el.clientHeight, start = performance.now(), ms = 3600;
    (function step(now) { const k = Math.min(1, (now - start) / ms); el.scrollTop = to * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); if (k < 1) requestAnimationFrame(step); else done(); })(start);
  }));
  await at(25.4);

  // 25.5s: the end card.
  await page.evaluate(() => document.getElementById('end').classList.add('on'));
  await at(LENGTH + 0.3);
  await cdp.send('Page.stopScreencast');
  await browser.close(); srv.close();

  // Each frame lasts until the next one; the last one holds to the full 30 seconds.
  const first = stamps[0].t, list = [];
  stamps.forEach((s, i) => {
    const end = i + 1 < stamps.length ? stamps[i + 1].t - first : LENGTH;
    list.push(`file '${s.file}'`, `duration ${Math.max(0.001, Math.min(end, LENGTH) - (s.t - first)).toFixed(4)}`);
  });
  list.push(`file '${stamps[stamps.length - 1].file}'`);
  fs.writeFileSync(path.join(frames, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(frames, 'list.txt'),
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-vf', `fps=30,scale=${W}:${H},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-t', String(LENGTH), '-movflags', '+faststart', FILE]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`wrote ${path.relative(ROOT, FILE)} from ${stamps.length} frames`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of FORMATS) await record(f);
})().catch((e) => { console.error(e); process.exit(1); });
