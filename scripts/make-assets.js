/* Renders the app icon and launch image from one drawing. Run: npm run assets (needs Playwright). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BG = '#070B16', GREEN = '#2F7BFF', CHALK = '#F5F7FF', RED = '#17D387';   // ring colours: blue and green on the app's navy
function board(size) {
  const c = size / 2, wedge = [];
  const ring = (r1, r2, i, fill) => {
    const a0 = (i * 18 - 9 - 90) * Math.PI / 180, a1 = (i * 18 + 9 - 90) * Math.PI / 180;
    const pt = (r, a) => (c + r * Math.cos(a)).toFixed(2) + ' ' + (c + r * Math.sin(a)).toFixed(2);
    return `<path d="M${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r2, a1)}A${r2} ${r2} 0 0 0 ${pt(r2, a0)}Z" fill="${fill}"/>`;
  };
  const R = size * 0.41;
  for (let i = 0; i < 20; i++) {
    wedge.push(ring(R, R * 0.86, i, i % 2 ? GREEN : RED));           // doubles ring
    wedge.push(ring(R * 0.86, R * 0.56, i, i % 2 ? CHALK : '#182241')); // outer singles
    wedge.push(ring(R * 0.56, R * 0.46, i, i % 2 ? GREEN : RED));    // trebles ring
    wedge.push(ring(R * 0.46, R * 0.2, i, i % 2 ? CHALK : '#182241'));  // inner singles
  }
  return wedge.join('') + `<circle cx="${c}" cy="${c}" r="${R * 0.2}" fill="${GREEN}"/><circle cx="${c}" cy="${c}" r="${R * 0.09}" fill="${RED}"/>`;
}
const svg = (size, mark) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${BG}"/>` +
  `<g transform="translate(${(size - mark) / 2} ${(size - mark) / 2})">${board(mark)}</g></svg>`;

(async () => {
  const root = path.join(__dirname, '..');
  const out = [
    { size: 1024, mark: 1024, file: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png' },
    { size: 2732, mark: 760, file: 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png' },
    { size: 2732, mark: 760, file: 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png' },
    { size: 2732, mark: 760, file: 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png' },
  ];
  fs.writeFileSync(path.join(root, 'resources/icon.svg'), svg(1024, 1024));
  const browser = await chromium.launch();
  for (const o of out) {
    const page = await browser.newPage({ viewport: { width: o.size, height: o.size }, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0">${svg(o.size, o.mark)}</body>`);
    await page.screenshot({ path: path.join(root, o.file), omitBackground: false });
    await page.close();
  }
  await browser.close();
  console.log('icon and launch image written');
})();
