/* Google Play Developer API, with no dependencies. Used by the two workflows in .github/workflows/.
   Reads the service account key from the PLAY_SERVICE_ACCOUNT_JSON environment variable (never a file in the repo).

     node scripts/play.js version-code               prints the next free versionCode for the app
     node scripts/play.js upload <file.aab> <track>  uploads a bundle and releases it to a track (internal, alpha, beta)
     node scripts/play.js products [--dry-run]       creates the subscriptions and one-time products in play.json
     node scripts/play.js listing [--dry-run]        updates the store listing text, contact details and graphics

   What to create and the listing text live in resources/store/play/. Products that already exist are left alone:
   change prices in Play Console, since Google treats a price change on a live product as a migration. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'resources', 'store', 'play');
const CFG = JSON.parse(fs.readFileSync(path.join(STORE, 'play.json'), 'utf8'));
const PKG = CFG.packageName;
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PKG;
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PKG;
const DRY = process.argv.includes('--dry-run');
const log = (...a) => console.error(...a);   // progress to stderr, so version-code's stdout stays clean

/* ---------- auth: a signed JWT exchanged for a one-hour access token ---------- */
let token;
async function auth() {
  if (token) return token;
  const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is not set. Add it as a GitHub Actions secret.');
  const key = JSON.parse(raw), now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: key.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const jwt = body + '.' + crypto.createSign('RSA-SHA256').update(body).sign(key.private_key, 'base64url');
  const r = await fetch(key.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Google sign-in failed: ' + (j.error_description || j.error || r.status));
  return (token = j.access_token);
}

/* One API call. Returns the parsed body, or null for a 404 when allow404 is set. */
async function call(method, url, { json, file, type, allow404 } = {}) {
  const headers = { authorization: 'Bearer ' + await auth() };
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (file) { headers['content-type'] = type || 'application/octet-stream'; body = fs.readFileSync(file); }
  const r = await fetch(url, { method, headers, body });
  const text = await r.text();
  if (r.status === 404 && allow404) return null;
  if (!r.ok) {
    let msg = text; try { msg = JSON.parse(text).error.message; } catch (e) {}
    const err = new Error(method + ' ' + url.replace(/^https:\/\/[^/]+/, '') + ' failed (' + r.status + '): ' + msg);
    err.status = r.status; err.apiMessage = msg; throw err;
  }
  return text ? JSON.parse(text) : {};
}

/* An edit is Play's draft of app changes: open one, change things, commit it. */
async function edit(fn, { commit = true } = {}) {
  const { id } = await call('POST', API + '/edits', { json: {} });
  try {
    const out = await fn(id);
    if (commit && !DRY) await call('POST', API + '/edits/' + id + ':commit');
    else await call('DELETE', API + '/edits/' + id).catch(() => {});   // already gone if fn committed it
    return out;
  } catch (e) {
    await call('DELETE', API + '/edits/' + id).catch(() => {});
    throw e;
  }
}

function money(amount, currencyCode) {   // "19.99" -> { units: "19", nanos: 990000000 }, without floating point
  const [u, f = ''] = String(amount).split('.');
  return { currencyCode, units: u, nanos: Number((f + '000000000').slice(0, 9)) };
}
function text(name, max) {
  const s = fs.readFileSync(path.join(STORE, 'listing', name), 'utf8').trim();
  if ([...s].length > max) throw new Error(name + ' is ' + [...s].length + ' characters; Play allows ' + max + '.');
  return s;
}
async function defaultLanguage() {
  return edit(async (id) => (await call('GET', API + '/edits/' + id + '/details')).defaultLanguage, { commit: false });
}

/* ---------- version-code ---------- */
async function versionCode() {
  const max = await edit(async (id) => {
    const codes = [];
    const b = await call('GET', API + '/edits/' + id + '/bundles');
    (b.bundles || []).forEach((x) => codes.push(Number(x.versionCode)));
    const t = await call('GET', API + '/edits/' + id + '/tracks');
    (t.tracks || []).forEach((tr) => (tr.releases || []).forEach((r) => (r.versionCodes || []).forEach((v) => codes.push(Number(v)))));
    return codes.length ? Math.max(...codes) : 0;
  }, { commit: false });
  console.log(max + 1);
}

/* ---------- upload ---------- */
async function upload(aab, track) {
  if (!aab || !fs.existsSync(aab)) throw new Error('No bundle at ' + aab);
  if (!['internal', 'alpha', 'beta'].includes(track)) throw new Error('Track must be internal, alpha or beta. Production stays a manual step in Play Console.');
  const notes = text('release_notes.txt', 500), lang = await defaultLanguage();
  await edit(async (id) => {
    log('Uploading ' + path.basename(aab) + '…');
    const b = await call('POST', UPLOAD + '/edits/' + id + '/bundles?uploadType=media', { file: aab });
    log('Uploaded versionCode ' + b.versionCode + '.');
    const mapping = path.join(path.dirname(aab), '..', '..', 'mapping', 'release', 'mapping.txt');
    if (fs.existsSync(mapping)) {   // R8's mapping file, so Play can show readable crash reports
      await call('POST', UPLOAD + '/edits/' + id + '/apks/' + b.versionCode + '/deobfuscationFiles/proguard?uploadType=media', { file: mapping });
      log('Uploaded the deobfuscation (mapping) file.');
    }
    const release = (status) => call('PUT', API + '/edits/' + id + '/tracks/' + track, { json: {
      track, releases: [{ name: b.versionCode + ' (' + (process.env.VERSION_NAME || '') + ')', versionCodes: [String(b.versionCode)], status, releaseNotes: [{ language: lang, text: notes }] }]
    } });
    await release('completed');
    try {
      await call('POST', API + '/edits/' + id + ':commit');
    } catch (e) {
      // Until the app's first release has been reviewed, Play only accepts draft releases.
      if (!/draft/i.test(e.apiMessage || '')) throw e;
      log('Play only takes draft releases until the app has been reviewed. Saving as a draft: roll it out in Play Console, under ' + track + '.');
      await release('draft');
      await call('POST', API + '/edits/' + id + ':commit');
    }
    log('Released versionCode ' + b.versionCode + ' to the ' + track + ' track.');
  }, { commit: false });   // committed above
}

/* ---------- products ---------- */
async function products() {
  const lang = await defaultLanguage();
  log('App default language: ' + lang + (DRY ? '. Dry run: nothing will be created.' : '.'));
  const prices = async (usd) => {   // Google's own conversion from the US price to every other region
    const r = await call('POST', API + '/pricing:convertRegionPrices', { json: { price: money(usd, 'USD') } });
    return { version: r.regionVersion.version, regions: Object.values(r.convertedRegionPrices), other: r.convertedOtherRegionsPrice };
  };

  for (const s of CFG.subscriptions) {
    if (await call('GET', API + '/subscriptions/' + s.productId, { allow404: true })) { log('Subscription ' + s.productId + ' already exists. Left as it is.'); continue; }
    const p = await prices(s.usdPrice);
    log('Subscription ' + s.productId + ': $' + s.usdPrice + ' every ' + s.billingPeriod + ', priced in ' + p.regions.length + ' regions.');
    if (DRY) continue;
    await call('POST', API + '/subscriptions?productId=' + s.productId + '&regionsVersion.version=' + encodeURIComponent(p.version), { json: {
      packageName: PKG, productId: s.productId,
      listings: [{ languageCode: lang, title: s.title, benefits: s.benefits }],
      basePlans: [{
        basePlanId: s.basePlanId,
        autoRenewingBasePlanType: { billingPeriodDuration: s.billingPeriod, legacyCompatible: true },
        regionalConfigs: p.regions.map((r) => ({ regionCode: r.regionCode, price: r.price, newSubscriberAvailability: true })),
        otherRegionsConfig: { usdPrice: p.other.usdPrice, eurPrice: p.other.eurPrice, newSubscriberAvailability: true }
      }]
    } });
    await call('POST', API + '/subscriptions/' + s.productId + '/basePlans/' + s.basePlanId + ':activate', { json: {} });
    log('  created and activated.');
  }

  for (const o of CFG.oneTimeProducts) {
    if (await call('GET', API + '/oneTimeProducts/' + o.productId, { allow404: true })) { log('One-time product ' + o.productId + ' already exists. Left as it is.'); continue; }
    const p = await prices(o.usdPrice);
    log('One-time product ' + o.productId + ': $' + o.usdPrice + ', priced in ' + p.regions.length + ' regions.');
    if (DRY) continue;
    await call('PATCH', API + '/onetimeproducts/' + o.productId + '?allowMissing=true&updateMask=listings,purchaseOptions&regionsVersion.version=' + encodeURIComponent(p.version), { json: {
      packageName: PKG, productId: o.productId,
      listings: [{ languageCode: lang, title: o.title, description: o.description }],
      purchaseOptions: [{
        purchaseOptionId: o.purchaseOptionId,
        buyOption: { legacyCompatible: true },
        regionalPricingAndAvailabilityConfigs: p.regions.map((r) => ({ regionCode: r.regionCode, price: r.price, availability: 'AVAILABLE' })),
        newRegionsConfig: { usdPrice: p.other.usdPrice, eurPrice: p.other.eurPrice, availability: 'AVAILABLE' }
      }]
    } });
    await call('POST', API + '/oneTimeProducts/' + o.productId + '/purchaseOptions:batchUpdateStates', { json: { requests: [
      { activatePurchaseOptionRequest: { packageName: PKG, productId: o.productId, purchaseOptionId: o.purchaseOptionId } }
    ] } });
    log('  created and activated.');
  }
}

/* ---------- listing ---------- */
async function listing() {
  const title = text('title.txt', 30), shortDescription = text('short_description.txt', 80), fullDescription = text('full_description.txt', 4000);
  const shots = path.join(STORE, 'screenshots', '1080x2160');
  const images = {
    icon: [path.join(STORE, 'icon-512.png')],
    featureGraphic: [path.join(STORE, 'feature-1024x500.png')],
    phoneScreenshots: fs.readdirSync(shots).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(shots, f))
  };
  await edit(async (id) => {
    const details = await call('GET', API + '/edits/' + id + '/details'), lang = details.defaultLanguage;
    log('Listing (' + lang + '): "' + title + '", ' + images.phoneScreenshots.length + ' screenshots' + (DRY ? '. Dry run: nothing will be saved.' : '.'));
    if (DRY) return;
    await call('PUT', API + '/edits/' + id + '/listings/' + lang, { json: { language: lang, title, shortDescription, fullDescription } });
    await call('PATCH', API + '/edits/' + id + '/details', { json: { contactEmail: CFG.contactEmail, contactWebsite: CFG.contactWebsite } });
    for (const [type, files] of Object.entries(images)) {
      await call('DELETE', API + '/edits/' + id + '/listings/' + lang + '/' + type);
      for (const f of files) await call('POST', UPLOAD + '/edits/' + id + '/listings/' + lang + '/' + type + '?uploadType=media', { file: f, type: 'image/png' });
      log('  ' + type + ': ' + files.length + ' uploaded.');
    }
  });
  if (!DRY) log('Listing saved.');
}

const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--dry-run');
const run = { 'version-code': versionCode, upload: () => upload(args[0], args[1]), products, listing }[cmd];
if (!run) { log('Usage: node scripts/play.js version-code | upload <file.aab> <track> | products [--dry-run] | listing [--dry-run]'); process.exit(2); }
run().catch((e) => { log(e.message); process.exit(1); });
