/* Renders the app's own paywall at iPhone size with the real prices, for the App Store Connect
   "review screenshot" on each product. Run: node scripts/make-review-shot.js (needs Playwright). */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'www'), OUT = path.join(__dirname, '..', 'resources', 'store');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const PRICES = { monthly: 0.99, yearly: 7.99, lifetime: 19.99 };

function store(prices) {   // stands in for the native plugins so the paywall shows live-style plans
  const pkg = (id, type, price) => ({ identifier: id, packageType: type, product: { title: id, priceString: '$' + price.toFixed(2), price } });
  const none = { customerInfo: { entitlements: { active: {} } } };
  const plugins = {
    Preferences: { get: async () => ({ value: null }), set: async () => {} },
    Haptics: { impact: async () => {}, notification: async () => {} },
    Purchases: { configure: async () => {}, addCustomerInfoUpdateListener: async () => {}, getCustomerInfo: async () => none,
      getOfferings: async () => ({ current: { availablePackages: [pkg('$rc_monthly', 'MONTHLY', prices.monthly), pkg('$rc_annual', 'ANNUAL', prices.yearly), pkg('$rc_lifetime', 'LIFETIME', prices.lifetime)] } }) },
    RevenueCatUI: {}
  };
  window.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => plugins[n] };
}

(async () => {
  const srv = await new Promise((r) => { const s = http.createServer((q, res) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0, () => r(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });   // 1290 x 2796, iPhone 6.7-inch
  const page = await ctx.newPage();
  await page.route('**/vendor/capacitor.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.addInitScript(store, PRICES);
  await page.goto(`http://localhost:${srv.address().port}/`);
  await page.waitForSelector('#playerSheet:not([hidden])');
  await page.fill('#plName', 'Dan'); await page.click('#playerSheet [data-close]');
  await page.click('#players [data-p="1"]'); await page.fill('#plName', 'Matt'); await page.click('#playerSheet [data-close]');
  await page.waitForFunction(() => document.querySelectorAll('#games .gcard.locked').length === 10);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'lobby.png') });
  await page.click('#openSet'); await page.click('#setSub');
  await page.waitForSelector('#plans .plan >> nth=2');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'review-paywall.png') });
  await browser.close(); srv.close();
  console.log('written to resources/store');
})();
