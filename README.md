# Good Arrows

A darts scorer for iPhone. 301 and 501 are free. Darts golf is the paid game, on a monthly subscription.

The bundle ID is `com.ludis.goodarrows` and the website is goodarrow.app. Items marked TODO in `www/config.js` are still to be filled in.

## How it is built

The app is plain HTML, CSS and JavaScript in `www/`, wrapped in a native iOS shell with [Capacitor](https://capacitorjs.com). There is no build step for the web code.

| File | What it holds |
|---|---|
| `www/engine.js` | The rules: X01 scoring, busts, checkout suggestions, golf scoring and honours. No DOM, so it runs in Node for tests. |
| `www/app.js` | The screen: state, controls, rendering, banners and confetti. |
| `www/store.js` | Saving. Native preferences on device, `localStorage` in a browser. |
| `www/pro.js` | The subscription, through RevenueCat. |
| `www/config.js` | App name, RevenueCat key, legal links. |
| `ios/` | The Xcode project Capacitor generated. iPhone only, portrait, iOS 15 and up. |
| `site/` | The goodarrow.app website: a landing page and the draft privacy policy. Not deployed yet. |

## Run it in a browser

```
npm install
npm run serve
```

Open the address it prints. Add `?pro=1` to the address to unlock golf, since a browser has no App Store. That switch only works in a browser and is ignored in the iOS app.

## Tests

```
npm test          # the rules, in Node
npm run test:ui   # a full run-through in a real browser at phone size (needs Playwright)
```

`test:ui` plays a 301 leg, hits the paywall, plays an 18-hole golf round, edits a hole and checks the scores survive a reload.

## Golf rules as built

Hole N is the number N on the board. Each player has up to three darts and the last dart thrown is the one that counts. Scores are against par:

| Dart | Score |
|---|---|
| Treble | -3 |
| Double | -2 |
| Inner single | -1 |
| Outer single | 0 |
| The number next door | +1 |
| Off the board | +3 |

-4 and +2 are on the keypad for house rules. The lowest total wins and throws first on the next hole. If the players are level, the order stays as it was.

## Shipping checklist

These need an Apple Developer account and a Mac with Xcode. None of them have been done yet.

**Apple**
1. Enrol in the Apple Developer Program.
2. In App Store Connect, accept the Paid Apps agreement and add banking and tax details. Subscriptions cannot go on sale until this is approved.
3. Enrol in the App Store Small Business Program to pay 15% commission instead of 30%.
4. Register the bundle ID and create the app record.
5. Create an auto-renewable subscription: one group, one monthly product at $0.99. Add its display name, description and a review screenshot of the paywall.

**RevenueCat**
1. Create a project and add the iOS app with the bundle ID and an App Store Connect API key.
2. Add the monthly product, attach it to an entitlement called `pro`, and put it in the default offering as the monthly package.
3. Copy the public iOS SDK key (it starts `appl_`) into `revenueCatKey` in `www/config.js`.

**The app**
1. Register the bundle ID `com.ludis.goodarrows` in the Apple Developer portal. If you want a different one, change `appId` in `capacitor.config.json` and `PRODUCT_BUNDLE_IDENTIFIER` in Xcode before creating the app record.
2. Fill in the bracketed items in `site/privacy/index.html`, deploy `site/` to goodarrow.app so the policy is live at https://goodarrow.app/privacy, and add `supportEmail` in `www/config.js`.
3. On the Mac: `npm install`, `npm run sync`, `npm run open`. In Xcode set the signing team, then run on a real iPhone.
4. Test a purchase, a restore and a cancellation with a sandbox Apple Account.
5. Archive and upload from Xcode. In App Store Connect add screenshots, the description, the privacy answers (purchase history, used for app functionality, not linked to identity and not used for tracking), the privacy policy URL and the terms link, then submit the app and the subscription together.

**What has not been verified**
- The iOS project has never been built. It was generated on Linux, where Xcode is not available.
- Nothing has run on a real iPhone, so safe areas, haptics and native saving are untested on device.
- The purchase flow has never run. The RevenueCat calls match the plugin's type definitions, but no real or sandbox purchase has been made.
