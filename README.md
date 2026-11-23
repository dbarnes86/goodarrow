# Good Arrows

A darts scorer for iPhone. 301 and 501 are free. Darts golf is the paid game, sold as a monthly or yearly subscription or a one-off lifetime purchase.

The bundle ID is `com.ludis.goodarrows` and the website is goodarrow.app. Items marked TODO in `www/config.js` are still to be filled in.

## How it is built

The app is plain HTML, CSS and JavaScript in `www/`, wrapped in a native iOS shell with [Capacitor](https://capacitorjs.com). There is no build step for the web code.

| File | What it holds |
|---|---|
| `www/engine.js` | The rules: X01 scoring, busts, checkout suggestions, golf scoring and honours. No DOM, so it runs in Node for tests. |
| `www/app.js` | The screen: state, controls, rendering, banners and confetti. |
| `www/store.js` | Saving. Native preferences on device, `localStorage` in a browser. |
| `www/pro.js` | Purchases through RevenueCat: entitlement, paywall, customer centre, restore. |
| `www/config.js` | App name, RevenueCat key, legal links. |
| `ios/` | The Xcode project Capacitor generated. iPhone only, portrait, iOS 15 and up. |
| `docs/` | The goodarrow.app website: a landing page and the privacy policy, served by GitHub Pages from this folder. |

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
npm run test:pro  # the purchase flow against a stand-in for RevenueCat (needs Playwright)
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
5. Create the three products: auto-renewable subscriptions `monthly` and `yearly` in one subscription group, and a non-consumable `lifetime`. Add display names, descriptions and a review screenshot of the paywall.

**RevenueCat**

The SDK is already in the app through the `@revenuecat/purchases-capacitor` and `@revenuecat/purchases-capacitor-ui` plugins, which pull in the native iOS SDK by Swift Package Manager when you run `npm run sync`. Nothing needs adding in Xcode.

1. Entitlement: `good_arrow_pro`. This is what unlocks Golf, and it is set in `www/config.js`.
2. Products: `monthly`, `yearly` and `lifetime`. Attach all three to `good_arrow_pro` and put them in the default offering as the Monthly, Annual and Lifetime packages.
3. Paywall: design it in RevenueCat under Paywalls and attach it to the default offering. The app shows that paywall when someone taps Golf. If it cannot be shown, the app falls back to its own sheet listing the same packages.
4. Customer Center: switch it on in RevenueCat. "Manage purchase" in Settings opens it.
5. API key: `www/config.js` currently holds a Test Store key (`test_...`), which lets you make pretend purchases with no App Store setup. Before submitting, create the products in App Store Connect, connect the app in RevenueCat, and replace the key with the App Store one (`appl_...`). Apple rejects a build that ships a test key.

**The app**
1. Register the bundle ID `com.ludis.goodarrows` in the Apple Developer portal. If you want a different one, change `appId` in `capacitor.config.json` and `PRODUCT_BUNDLE_IDENTIFIER` in Xcode before creating the app record.
2. Turn on GitHub Pages for this repo (Settings, Pages, deploy from branch `main`, folder `/docs`) and point goodarrow.app at it, so the policy is live at https://goodarrow.app/privacy.
3. On the Mac: `npm install`, `npm run sync`, `npm run open`. In Xcode set the signing team, then run on a real iPhone.
4. Test a purchase, a restore and a cancellation with a sandbox Apple Account.
5. Archive and upload from Xcode. In App Store Connect add screenshots, the description, the privacy answers (purchase history, used for app functionality, not linked to identity and not used for tracking), the privacy policy URL and the terms link, then submit the app and the subscription together.

**What has not been verified**
- The iOS project has never been built. It was generated on Linux, where Xcode is not available.
- Nothing has run on a real iPhone, so safe areas, haptics and native saving are untested on device.
- No purchase has been made against RevenueCat or the App Store. `test:pro` proves the app reacts correctly to each result, using a stand-in for the plugins, and the calls match the plugins' type definitions.
