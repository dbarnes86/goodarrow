/* Purchase flow, run in a browser against a stand-in for the native RevenueCat plugins.
   This checks the app's own logic: plans -> purchase -> entitlement -> games unlock, cancelling,
   failures, restore, the customer centre, and the optional hosted paywall. It cannot prove the real SDK or the App Store work. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'www');
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

/* Runs in the page before the app's scripts. */
function fakeNative(opts) {
  const pkg = (id, type, price) => ({ identifier: id, packageType: type, product: { title: id, priceString: price, price: +price.slice(1) } });
  const m = window.__mock = { entitled: !!opts.entitled, calls: [], paywall: opts.paywall, purchase: opts.purchase || 'ok', listener: null, key: null };
  const info = () => ({ customerInfo: { entitlements: { active: m.entitled ? { good_arrow_pro: { isActive: true } } : {} } } });
  const plugins = {
    Preferences: { get: async () => ({ value: null }), set: async () => {} },
    Haptics: { impact: async () => {}, notification: async () => {} },
    Purchases: {
      configure: async (o) => { m.key = o.apiKey; },
      addCustomerInfoUpdateListener: async (fn) => { m.listener = fn; },
      getCustomerInfo: async () => info(),
      getOfferings: async () => ({ current: { availablePackages: [pkg('$rc_lifetime', 'LIFETIME', '$19.99'), pkg('$rc_annual', 'ANNUAL', '$7.99'), pkg('$rc_monthly', 'MONTHLY', '$0.99')] } }),
      purchasePackage: async (o) => {
        m.calls.push('purchase:' + o.aPackage.identifier);
        if (m.purchase === 'cancel') throw { userCancelled: true, code: '1', message: 'cancelled' };
        if (m.purchase === 'fail') throw { code: '2', message: 'There was a problem with the App Store.' };
        m.entitled = true; return info();
      },
      restorePurchases: async () => { m.calls.push('restore'); return info(); },
    },
    RevenueCatUI: {
      presentPaywall: async () => { m.calls.push('paywall'); if (m.paywall === 'PURCHASED') m.entitled = true; return { result: m.paywall }; },
      presentCustomerCenter: async () => { m.calls.push('customerCenter'); },
    },
  };
  window.Capacitor = { isNativePlatform: () => true, registerPlugin: (name) => plugins[name] };
}

async function open(browser, base, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.route('**/vendor/capacitor.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  if (opts.hosted) {   // use the paywall designed in the RevenueCat dashboard
    const cfg = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace('nativePaywall: false', 'nativePaywall: true');
    assert.ok(cfg.includes('nativePaywall: true'));
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: cfg }));
  }
  await page.addInitScript(fakeNative, opts);
  await page.goto(base);
  await page.waitForSelector('#playerSheet:not([hidden])');
  await page.click('#playerSheet [data-close]');
  await page.waitForFunction(() => window.__mock.key !== null);
  return page;
}
const calls = (page) => page.evaluate(() => window.__mock.calls);
const lockedCount = (page) => page.locator('#games .gcard.locked').count();

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  let step = '';
  try {
    step = 'configures with the key from config; ten games start locked';
    let page = await open(browser, base, {});
    assert.match(await page.evaluate(() => window.__mock.key), /^(test|appl)_/);
    assert.equal(await lockedCount(page), 10);

    step = 'the app paywall lists the three plans in order with live prices, yearly selected';
    await page.click('#games [data-g="golf"]');
    await page.waitForSelector('#paySheet:not([hidden])');
    assert.deepEqual(await calls(page), [], 'the hosted paywall is not used unless config asks for it');
    const plans = await page.locator('#plans .plan').allInnerTexts();
    assert.equal(plans.length, 3);
    assert.match(plans[0], /Monthly[\s\S]*\$0\.99/); assert.match(plans[1], /Yearly[\s\S]*\$7\.99[\s\S]*Save 33%/i); assert.match(plans[2], /Lifetime[\s\S]*\$19\.99/);
    assert.equal(await page.locator('#plans .plan[aria-checked="true"]').getAttribute('data-id'), '$rc_annual');
    assert.ok(await page.locator('#payBuy').isEnabled());

    step = 'cancelling a purchase is not an error';
    await page.evaluate(() => { window.__mock.purchase = 'cancel'; });
    await page.click('#payBuy');
    await page.waitForFunction(() => window.__mock.calls.includes('purchase:$rc_annual'));
    assert.ok(await page.locator('#paySheet').isVisible());
    assert.equal(await page.locator('#payNote').innerText(), '');

    step = 'a failed purchase shows the store message';
    await page.evaluate(() => { window.__mock.purchase = 'fail'; });
    await page.click('#plans .plan >> nth=0'); await page.click('#payBuy');
    await page.waitForFunction(() => /problem with the App Store/.test(document.getElementById('payNote').innerText));
    assert.equal(await lockedCount(page), 10);

    step = 'restore with nothing to restore says so';
    await page.click('#payRestore');
    await page.waitForFunction(() => /No purchase found/.test(document.getElementById('payNote').innerText));

    step = 'buying unlocks every game and carries on to the game that was tapped';
    await page.evaluate(() => { window.__mock.purchase = 'ok'; });
    await page.click('#plans .plan >> nth=2'); await page.click('#payBuy');
    await page.waitForSelector('#setupSheet:not([hidden])');
    assert.ok((await calls(page)).includes('purchase:$rc_lifetime'));
    assert.match(await page.locator('#suName').innerText(), /Golf/i);
    assert.ok(await page.locator('#paySheet').isHidden());
    assert.equal(await lockedCount(page), 0);

    step = 'customer centre opens for a customer';
    await page.click('#setupSheet [data-close]');
    await page.click('#openSet');
    assert.match(await page.locator('#setSub').innerText(), /Manage purchase/);
    await page.click('#setSub');
    await page.waitForFunction(() => window.__mock.calls.includes('customerCenter'));
    await page.click('#setSheet [data-close]');

    step = 'losing the entitlement (refund, expiry) locks the Pro games again';
    await page.evaluate(() => { window.__mock.entitled = false; window.__mock.listener({ entitlements: { active: {} } }); });
    await page.waitForFunction(() => document.querySelectorAll('#games .gcard.locked').length === 10);
    assert.deepEqual(page.errors, []);
    await page.context().close();

    step = 'an existing customer starts unlocked and never sees a paywall';
    page = await open(browser, base, { entitled: true });
    await page.waitForFunction(() => document.querySelectorAll('#games .gcard.locked').length === 0);
    await page.click('#games [data-g="golf"]');
    await page.waitForSelector('#setupSheet:not([hidden])');
    assert.deepEqual(await calls(page), []);
    await page.context().close();

    step = 'hosted paywall: a purchase there unlocks the games';
    page = await open(browser, base, { hosted: true, paywall: 'PURCHASED' });
    await page.click('#games [data-g="cricket"]');
    await page.waitForFunction(() => document.querySelectorAll('#games .gcard.locked').length === 0);
    assert.deepEqual(await calls(page), ['paywall']);
    assert.ok(await page.locator('#paySheet').isHidden(), 'the app paywall is not shown as well');
    await page.context().close();

    step = 'hosted paywall: dismissing it leaves the games locked';
    page = await open(browser, base, { hosted: true, paywall: 'CANCELLED' });
    await page.click('#games [data-g="cricket"]');
    await page.waitForFunction(() => window.__mock.calls.includes('paywall'));
    assert.equal(await lockedCount(page), 10); assert.ok(await page.locator('#paySheet').isHidden());
    await page.context().close();

    step = 'hosted paywall: if it cannot be shown, the app paywall takes over';
    page = await open(browser, base, { hosted: true, paywall: 'ERROR' });
    await page.click('#games [data-g="cricket"]');
    await page.waitForSelector('#paySheet:not([hidden])');
    assert.equal(await page.locator('#plans .plan').count(), 3);
    assert.deepEqual(page.errors, []);
    await page.context().close();

    console.log('Purchase flow passed');
  } catch (e) {
    console.error('FAILED at: ' + step + '\n' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser.close(); srv.close();
  }
})();
