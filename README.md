# Good Arrows

A darts scorer for iPhone with twelve games for one to six players. 301, 501, 701 and Count-Up are free. The other ten games are Good Arrows Pro, sold as a monthly or yearly subscription or a one-off lifetime purchase.

The bundle ID is `com.ludis.goodarrow` and the website is goodarrow.app. Items marked TODO in `www/config.js` are still to be filled in.

## The games

| Game | Free | In short |
|---|---|---|
| 301 / 501 / 701 | Yes | Race down to zero, double to finish (optional) |
| Count-Up | Yes | Eight rounds, highest total wins |
| Golf | Pro | 9 or 18 holes against par, last dart counts, lowest total has the honour |
| Cricket | Pro | Close 20 to 15 and the bull, score on what others have open |
| Killer | Pro | Hit your own double to arm, then take lives off everyone else's |
| Around the Clock | Pro | 1 to 20 in order, then the bull |
| Shanghai | Pro | Seven rounds; single, double and treble in one turn wins outright |
| Halve-It | Pro | 20, 16, double 7, 14, 18, treble 10, bull; miss and your score halves |
| Bob's 27 | Pro | Every double in turn; a blank round costs you that double |
| Baseball | Pro | Nine innings on the numbers 1 to 9 |
| Knockout | Pro | Beat the score thrown before you or lose a life |
| Gotcha | Pro | Race up to exactly 301; land on a rival's total and they go back to zero |

Each game's full rules are in the app (the "How to play" list on its set-up sheet) and in `GAMES` in `www/engine.js`. Golf scoring is the house version: treble -3, double -2, inner single -1, outer single par, next door +1, off the board +3, with -4 and +2 on the keypad for house rules.

## How it is built

The app is plain HTML, CSS and JavaScript in `www/`, wrapped in a native iOS shell with [Capacitor](https://capacitorjs.com). There is no build step for the web code.

| File | What it holds |
|---|---|
| `www/engine.js` | The rules for every game, as pure functions over plain state. No DOM, so it runs in Node for tests. Adding a game means adding one entry to `G` and one to `GAMES`. |
| `www/app.js` | The screens: lobby, set-up, a game in play, results, settings, paywall, banners and confetti. |
| `www/styles.css` | The design: one dark theme, tokens at the top. |
| `www/store.js` | Saving. Native preferences on device, `localStorage` in a browser. |
| `www/pro.js` | Purchases through RevenueCat: entitlement, plans, customer centre, restore. |
| `www/config.js` | App name, RevenueCat key, legal links. |
| `ios/` | The Xcode project Capacitor generated. iPhone only, portrait, iOS 15 and up. |
| `docs/` | The goodarrow.app website: a landing page and the privacy policy, served by GitHub Pages from this folder. |

Every game is driven through the same four calls (`Engine.create`, `dart`, `view`, `rematch`). `view` tells the screen what to draw, including which of the two input pads to show: the full board pad, or a row of big buttons for games with a single target.

## Run it in a browser

```
npm install
npm run serve
```

Open the address it prints. Add `?pro=1` to the address to unlock the Pro games, since a browser has no App Store. That switch only works in a browser and is ignored in the iOS app. Without it, the paywall shows example prices.

## Tests

```
npm test          # the rules of all twelve games, in Node
npm run test:ui   # a run-through in a real browser at phone size (needs Playwright)
npm run test:pro  # the purchase flow against a stand-in for RevenueCat (needs Playwright)
```

`test:ui` covers first launch, the lobby and paywall, a 301 leg with a bust and a checkout, Count-Up, Golf with an edit, three-player Killer, Cricket, Around the Clock, and a reload mid-game.

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

1. Entitlement: `good_arrow_pro`. This is what unlocks the ten Pro games, and it is set in `www/config.js`.
2. Products: `monthly`, `yearly` and `lifetime`. Attach all three to `good_arrow_pro` and put them in the default offering as the Monthly, Annual and Lifetime packages.
3. Paywall: the app draws its own, listing the three packages with live prices. To use a paywall designed in RevenueCat instead, set `nativePaywall: true` in `www/config.js` and attach one to the default offering.
4. Customer Center: switch it on in RevenueCat. "Manage purchase" in Settings opens it.
5. API key: `www/config.js` holds the App Store public key (`appl_...`). The three App Store products are attached to `good_arrow_pro` and sit in the `default` offering next to the Test Store ones. To test with pretend purchases, swap in the project's Test Store key (`test_...`) locally, and never ship a build with it.

**The app**
1. The bundle ID `com.ludis.goodarrow` is registered in the Apple Developer portal and set in `capacitor.config.json` and the Xcode project.
2. Turn on GitHub Pages for this repo (Settings, Pages, deploy from branch `main`, folder `/docs`) and point goodarrow.app at it, so the policy is live at https://goodarrow.app/privacy.
3. On the Mac: `npm install`, `npm run sync`, `npm run open`. In Xcode set the signing team, then run on a real iPhone.
4. Test a purchase, a restore and a cancellation with a sandbox Apple Account.
5. Archive and upload from Xcode. In App Store Connect add screenshots, the description, the privacy answers (purchase history, used for app functionality, not linked to identity and not used for tracking), the privacy policy URL and the terms link, then submit the app and the subscription together.

**What has not been verified**
- The iOS project has never been built. It was generated on Linux, where Xcode is not available.
- Nothing has run on a real iPhone, so safe areas, haptics and native saving are untested on device.
- No purchase has been made against RevenueCat or the App Store. `test:pro` proves the app reacts correctly to each result, using a stand-in for the plugins, and the calls match the plugins' type definitions.
