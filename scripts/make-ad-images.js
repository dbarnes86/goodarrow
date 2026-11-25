/* Renders the image ads for a Google Ads App campaign, in the three shapes it asks for:
   landscape 1200 x 628, square 1200 x 1200 and portrait 1200 x 1500. Each takes the phone from a Play
   screenshot in resources/store/play/screenshots/1080x2160/, so run `node scripts/make-store-shots.js --play`
   first after a design change. Run: npm run ads (needs Playwright). Output: resources/store/ads/ */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'resources', 'store', 'play', 'screenshots', '1080x2160');
const OUT = path.join(ROOT, 'resources', 'store', 'ads');
const b64 = (f) => fs.readFileSync(f).toString('base64');
const FONT_BS = b64(path.join(ROOT, 'www', 'fonts', 'big-shoulders-display-latin-800-normal.woff2'));
const FONT_FT = b64(path.join(ROOT, 'www', 'fonts', 'figtree-latin-600-normal.woff2'));
const ICON = b64(path.join(ROOT, 'resources', 'store', 'play', 'icon-512.png'));

// Where the phone sits in a 1080 x 2160 Play screenshot (make-store-shots.js draws it at 340 of 440 units, 230 down).
const K = 1080 / 440, PHONE = { left: 50 * K, top: 230 * K, width: 340 * K, radius: 44 * K };

const ADS = [
  { shot: '1-games', title: 'Twelve darts games.<br>One app.', sub: '301, Cricket, Killer, Golf and more' },
  { shot: '2-checkout', title: 'Every checkout,<br>called', sub: 'Busts spotted, finishes suggested' },
  { shot: '3-golf', title: 'Golf, scored<br>against par', sub: 'Up to six players at the board' }
];
const SIZES = [
  { name: 'landscape', w: 1200, h: 628 },
  { name: 'square', w: 1200, h: 1200 },
  { name: 'portrait', w: 1200, h: 1500 }
];

/* The phone, cropped from the screenshot with CSS: the whole screenshot is the background, scaled so the
   phone is `width` wide, and offset so only the phone shows. It runs off the bottom of the ad on purpose. */
function phone(img, width, height) {
  const s = width / PHONE.width;
  return `<div class="phone" style="width:${width}px;height:${height}px;border-radius:${PHONE.radius * s}px ${PHONE.radius * s}px 0 0;
    background:url(data:image/png;base64,${img}) ${-PHONE.left * s}px ${-PHONE.top * s}px / ${1080 * s}px ${2160 * s}px no-repeat"></div>`;
}

function page(ad, size, img) {
  const { w, h, name } = size, wide = name === 'landscape';
  const phoneW = wide ? 430 : name === 'square' ? 600 : 700;
  const phoneTop = wide ? 64 : name === 'square' ? 470 : 560;
  const body = wide
    ? `<div class="copy" style="left:72px;top:0;bottom:0;width:640px;justify-content:center;text-align:left;align-items:flex-start">
         <div class="brand"><img src="data:image/png;base64,${ICON}">Good Arrows</div>
         <h1 style="font-size:82px">${ad.title}</h1><p style="font-size:30px">${ad.sub}</p></div>
       <div style="position:absolute;left:${w - phoneW - 70}px;top:${phoneTop}px">${phone(img, phoneW, h - phoneTop)}</div>`
    : `<div class="copy" style="left:60px;right:60px;top:${name === 'square' ? 84 : 110}px;align-items:center;text-align:center">
         <div class="brand"><img src="data:image/png;base64,${ICON}">Good Arrows</div>
         <h1 style="font-size:${name === 'square' ? 104 : 116}px">${ad.title}</h1><p style="font-size:36px">${ad.sub}</p></div>
       <div style="position:absolute;left:${(w - phoneW) / 2}px;top:${phoneTop}px">${phone(img, phoneW, h - phoneTop)}</div>`;
  return `<!doctype html><html><head><style>
    @font-face{font-family:BS;font-weight:800;src:url(data:font/woff2;base64,${FONT_BS}) format('woff2')}
    @font-face{font-family:FT;font-weight:600;src:url(data:font/woff2;base64,${FONT_FT}) format('woff2')}
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    body{position:relative;color:#F5F7FF;font-family:FT,sans-serif;
      background:radial-gradient(${wide ? '90% 140% at 75% 0%' : '130% 70% at 50% 0%'},#1D3F96 0%,#0B1530 52%,#070B16 100%)}
    .copy{position:absolute;display:flex;flex-direction:column;gap:18px}
    .brand{display:flex;align-items:center;gap:14px;font-family:BS;font-weight:800;font-size:34px;letter-spacing:.06em;text-transform:uppercase;color:#C6D6FF}
    .brand img{width:56px;height:56px;border-radius:14px}
    h1{margin:6px 0 0;font-family:BS;font-weight:800;line-height:.95;letter-spacing:.01em;text-transform:uppercase}
    p{margin:0;color:#C6D6FF;line-height:1.3}
    .phone{box-shadow:0 0 0 2px #3A4A78,0 30px 90px rgba(0,0,0,.6),0 0 110px rgba(47,123,255,.3)}
  </style></head><body>${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let n = 0;
  for (const ad of ADS) {
    const img = b64(path.join(SHOTS, ad.shot + '.png'));
    for (const size of SIZES) {
      const p = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
      await p.setContent(page(ad, size, img));
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: path.join(OUT, `${ad.shot.slice(2)}-${size.name}-${size.w}x${size.h}.png`) });
      await p.close(); n++;
    }
  }
  await browser.close();
  console.log('wrote ' + n + ' ad images to resources/store/ads');
})().catch((e) => { console.error(e); process.exit(1); });
