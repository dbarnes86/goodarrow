/* Purchase flow, run in a browser against a stand-in for the native RevenueCat plugins.
   This checks the app's own logic: paywall result -> entitlement -> Golf unlocks, the fallback
   sheet, cancelling, and the customer centre. It cannot prove the real SDK or the App Store work. */
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
  const pkg = (id, type, price) => ({ identifier: id, packageType: type, product: { title: id, priceString: price } });
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
  await page.addInitScript(fakeNative, opts);
  await page.goto(base);
  await page.waitForSelector('#setSheet:not([hidden])');
  await page.click('#setSheet [data-close]');
  await page.waitForFunction(() => window.__mock.key !== null);
  return page;
}
const calls = (page) => page.evaluate(() => window.__mock.calls);

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  let step = '';
  try {
    step = 'configures with the key and entitlement from config';
    let page = await open(browser, base, { paywall: 'PURCHASED' });
    assert.match(await page.evaluate(() => window.__mock.key), /^(test|appl)_/);
    assert.ok(await page.locator('#lock').isVisible(), 'Golf shows as locked');

    step = 'RevenueCat paywall purchase unlocks Golf';
    await page.click('#tabG');
    await page.waitForSelector('#vg:not([hidden])');
    assert.deepEqual(await calls(page), ['paywall']);
    assert.ok(await page.locator('#paySheet').isHidden(), 'the fallback sheet is not used');
    assert.ok(await page.locator('#lock').isHidden());

    step = 'customer centre opens for a customer';
    await page.click('#openSet');
    assert.match(await page.locator('#setSub').innerText(), /Manage purchase/);
    await page.click('#setSub');
    await page.waitForFunction(() => window.__mock.calls.includes('customerCenter'));
    assert.deepEqual(page.errors, []);
    await page.context().close();

    step = 'dismissing the RevenueCat paywall leaves Golf locked';
    page = await open(browser, base, { paywall: 'CANCELLED' });
    await page.click('#tabG');
    await page.waitForFunction(() => window.__mock.calls.includes('paywall'));
    assert.ok(await page.locator('#vg').isHidden());
    assert.ok(await page.locator('#paySheet').isHidden());
    await page.context().close();

    step = 'fallback sheet lists the three plans in order when the paywall cannot be shown';
    page = await open(browser, base, { paywall: 'ERROR', purchase: 'cancel' });
    await page.click('#tabG');
    await page.waitForSelector('#paySheet:not([hidden])');
    const plans = await page.locator('#plans .plan').allInnerTexts();
    assert.equal(plans.length, 3);
    assert.match(plans[0], /Monthly[\s\S]*\$0\.99/); assert.match(plans[1], /Yearly[\s\S]*\$7\.99/); assert.match(plans[2], /Lifetime[\s\S]*\$19\.99/);

    step = 'cancelling a purchase is not an error';
    await page.click('#plans .plan >> nth=1');
    await page.waitForFunction(() => window.__mock.calls.includes('purchase:$rc_annual'));
    assert.ok(await page.locator('#paySheet').isVisible());
    assert.equal(await page.locator('#payNote').innerText(), '');

    step = 'a failed purchase shows the store message';
    await page.evaluate(() => { window.__mock.purchase = 'fail'; });
    await page.click('#plans .plan >> nth=0');
    await page.waitForFunction(() => /problem with the App Store/.test(document.getElementById('payNote').innerText));
    assert.ok(await page.locator('#vg').isHidden());

    step = 'restore with nothing to restore says so';
    await page.click('#payRestore');
    await page.waitForFunction(() => /No purchase found/.test(document.getElementById('payNote').innerText));

    step = 'buying from the fallback sheet unlocks Golf';
    await page.evaluate(() => { window.__mock.purchase = 'ok'; });
    await page.click('#plans .plan >> nth=2');
    await page.waitForSelector('#vg:not([hidden])');
    assert.ok(await page.locator('#paySheet').isHidden());

    step = 'losing the entitlement (refund, expiry) locks Golf again without losing the round';
    await page.evaluate(() => { window.__mock.entitled = false; window.__mock.listener({ entitlements: { active: {} } }); });
    await page.waitForSelector('#vx:not([hidden])');
    assert.ok(await page.locator('#lock').isVisible());
    assert.deepEqual(page.errors, []);
    await page.context().close();

    step = 'an existing customer starts unlocked';
    page = await open(browser, base, { paywall: 'ERROR', entitled: true });
    await page.waitForFunction(() => document.getElementById('lock').hidden);
    await page.click('#tabG');
    await page.waitForSelector('#vg:not([hidden])');
    assert.deepEqual(await calls(page), [], 'no paywall for a customer');
    await page.context().close();

    console.log('Purchase flow passed');
  } catch (e) {
    console.error('FAILED at: ' + step + '\n' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser.close(); srv.close();
  }
})();
