/* Renders the App Store product page header in the two sizes App Store Connect supports.
   A floodlit board in the dark, in the app's colours. No text: Apple lays the app's name and the
   Get button over the header, and crops it differently by device, so the board sits right of centre
   and the lower left is kept dark. Run: npm run header (needs Playwright). Output: resources/store/header/ */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FONTS = path.join(__dirname, '..', 'www', 'fonts');
const OUT = path.join(__dirname, '..', 'resources', 'store', 'header');
const SIZES = [[5244, 2950], [3840, 1646]];
const FONT = fs.readFileSync(path.join(FONTS, 'big-shoulders-display-latin-800-normal.woff2')).toString('base64');   // inline: a blank page can't fetch a font from another origin
const NUMS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

function board() {
  const c = 500, R = 400, P = (r, a) => (c + r * Math.cos(a)).toFixed(2) + ' ' + (c + r * Math.sin(a)).toFixed(2);
  const ring = (r1, r2, k, fill) => {
    const a0 = (k * 18 - 99) * Math.PI / 180, a1 = (k * 18 - 81) * Math.PI / 180;
    return `<path d="M${P(r1, a0)}A${r1} ${r1} 0 0 1 ${P(r1, a1)}L${P(r2, a1)}A${r2} ${r2} 0 0 0 ${P(r2, a0)}Z" fill="${fill}"/>`;
  };
  let w = '', n = '';
  for (let k = 0; k < 20; k++) {
    const hot = k % 2 ? '#17D387' : '#2F7BFF', a = k % 2 ? '#E9EEFB' : '#16213F';
    w += ring(R, R * .9, k, hot) + ring(R * .9, R * .6, k, a) + ring(R * .6, R * .5, k, hot) + ring(R * .5, R * .12, k, a);
    const ang = (k * 18 - 90) * Math.PI / 180;
    n += `<text x="${(c + R * 1.12 * Math.cos(ang)).toFixed(1)}" y="${(c + R * 1.12 * Math.sin(ang)).toFixed(1)}" transform="rotate(${k * 18} ${(c + R * 1.12 * Math.cos(ang)).toFixed(1)} ${(c + R * 1.12 * Math.sin(ang)).toFixed(1)})">${NUMS[k]}</text>`;
  }
  let wires = '';
  for (let k = 0; k < 20; k++) { const a = (k * 18 - 99) * Math.PI / 180; wires += `<line x1="${P(R * .12, a).split(' ')[0]}" y1="${P(R * .12, a).split(' ')[1]}" x2="${P(R, a).split(' ')[0]}" y2="${P(R, a).split(' ')[1]}"/>`; }
  return `<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="sh" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>
    <circle cx="500" cy="500" r="490" fill="#0A1124"/><circle cx="500" cy="500" r="486" fill="none" stroke="#2A3760" stroke-width="6"/>
    <g font-family="BS" font-weight="800" font-size="46" fill="#C9D4F2" text-anchor="middle" dominant-baseline="central">${n}</g>
    ${w}
    <circle cx="500" cy="500" r="${R * .12}" fill="#17D387"/><circle cx="500" cy="500" r="${R * .055}" fill="#2F7BFF"/>
    <g stroke="#9FB0D8" stroke-opacity=".55" stroke-width="2.2" fill="none">${wires}
      ${[1, .9, .6, .5, .12, .055].map((k) => `<circle cx="500" cy="500" r="${R * k}"/>`).join('')}</g>
    <circle cx="500" cy="500" r="${R}" fill="url(#sh)"/>
  </svg>`;
}

/* Three darts in the treble 20, drawn as simple flat shapes in the app's colours. */
function darts() {
  const one = (x, y, rot, flight) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(.55)">
    <rect x="-3" y="-8" width="6" height="40" rx="2" fill="#C8D0E4"/>
    <rect x="-9" y="-122" width="18" height="118" rx="7" fill="#2A3556"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="-9" y="${-110 + i * 18}" width="18" height="6" fill="#4A5A86"/>`).join('')}
    <rect x="-4" y="-196" width="8" height="78" rx="3" fill="#0D1530"/>
    <path d="M0 -196 L-44 -262 L-44 -300 L0 -238 Z" fill="${flight}"/><path d="M0 -196 L44 -262 L44 -300 L0 -238 Z" fill="${flight}" opacity=".78"/>
  </g>`;
  // tips sit in the treble 20 ring (y 260 to 300 in the board's 1000-unit box)
  return one(480, 268, -12, '#2F7BFF') + one(500, 264, 3, '#17D387') + one(519, 270, 15, '#FFC53D');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [W, H] of SIZES) {
    const w = W / 2, h = H / 2, wide = w / h > 2;
    const size = h * (wide ? 0.9 : 0.86);                         // board diameter
    const cx = w * (wide ? 0.72 : 0.66), cy = h * 0.5;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const confetti = Array.from({ length: 70 }, (_, i) => {
      const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1, y = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1;
      const col = ['#2F7BFF', '#17D387', '#FFC53D', '#F5F7FF'][i % 4], s = 6 + (i % 5) * 3;
      return `<i style="left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%;width:${s * 1.8}px;height:${s}px;background:${col};transform:rotate(${(i * 47) % 180}deg);opacity:${(0.18 + (i % 4) * 0.1).toFixed(2)}"></i>`;
    }).join('');
    await page.setContent(`<!doctype html><html><head><style>
      @font-face{font-family:BS;font-weight:800;src:url(data:font/woff2;base64,${FONT}) format('woff2')}
      html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#05080F}
      .bg{position:absolute;inset:0;background:radial-gradient(${size * 1.25}px ${size * 1.25}px at ${cx}px ${cy}px,#1C3C93 0%,#0E1D48 38%,#070B16 72%),#070B16}
      .beam{position:absolute;left:${cx - size * 0.9}px;top:${-h * 0.2}px;width:${size * 1.8}px;height:${h * 1.4}px;background:radial-gradient(50% 60% at 50% 0%,rgba(173,204,255,.20),rgba(173,204,255,0) 70%);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);filter:blur(${size * 0.02}px)}
      .glow{position:absolute;left:${cx - size * 0.75}px;top:${cy - size * 0.75}px;width:${size * 1.5}px;height:${size * 1.5}px;border-radius:50%;background:radial-gradient(circle,rgba(47,123,255,.35),rgba(47,123,255,0) 62%)}
      .board{position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size};filter:drop-shadow(0 ${size * 0.05}px ${size * 0.08}px rgba(0,0,0,.65))}
      .board svg{width:${size}px;height:${size}px;display:block}
      .darts{position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px}
      .conf i{position:absolute;border-radius:2px}
      .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,8,15,.85) 0%,rgba(5,8,15,.35) 34%,rgba(5,8,15,0) 52%),linear-gradient(0deg,rgba(5,8,15,.7) 0%,rgba(5,8,15,0) 30%)}
    </style></head><body><div class="bg"></div><div class="beam"></div><div class="conf">${confetti}</div><div class="glow"></div>
      <div class="board">${board()}</div><svg class="darts" viewBox="0 0 1000 1000">${darts()}</svg><div class="shade"></div></body></html>`);
    await page.evaluate(() => document.fonts.load('800 46px BS').then(() => document.fonts.ready));   // the numbers are SVG text, so load the face before the shot
    await page.screenshot({ path: path.join(OUT, `header-${W}x${H}.png`) });
    await page.close();
  }
  await browser.close();
  console.log('header written to resources/store/header');
})().catch((e) => { console.error(e); process.exit(1); });
