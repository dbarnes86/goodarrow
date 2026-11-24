# Google Play listing: Good Arrows

Everything needed to set the app up in Play Console, in the order Play Console asks for it. Character counts are checked against Play's limits. The App Store equivalent is `listing.md`.

Package name: `com.ludis.goodarrow`. It is permanent once the first build is uploaded.

## 0. Android wording (done)

The Android build now shows Google Play wording: the paywall small print, the restore message and the Manage link (`manageUrlAndroid` in `www/config.js`). There's no terms link on Android, as Play has no standard EULA; set `termsUrlAndroid` if goodarrow.app gets a terms page. The privacy policy and website cover both stores. iOS is unchanged.

## 1. Create app

Play Console, All apps, Create app.

| Field | Value |
|---|---|
| App name (30) | `Good Arrows: Darts Games` (24) |
| Default language | English (United Kingdom) – en-GB |
| App or game | App |
| Free or paid | Free (Pro is sold in-app). This can't be changed to paid later. |
| Declarations | Tick Developer Program Policies and US export laws |

## 2. Store settings

| Field | Value |
|---|---|
| App category | Sports |
| Tags | Sports, Scorekeeping (pick whatever closest options Play offers) |
| Email | `hello@lud.is` |
| Website | `https://goodarrow.app` |
| Phone | Optional. Leave blank. |
| External marketing | Leave on |

## 3. Main store listing

**App name (30):** `Good Arrows: Darts Games`

**Short description (80):**

```
Darts scorer for 301, 501, Cricket, Killer, Golf and more. One to six players.
```

**Full description (4000):**

```
Good Arrows is the darts scorer for a night at the board. Tap what you hit and it does the maths: busts called, checkouts suggested, turns passed and every result kept.

TWELVE GAMES
• 301, 501 and 701, with optional double-out
• Count-Up
• Golf, over 9 or 18 holes, scored against par
• Cricket
• Killer
• Around the Clock
• Shanghai
• Halve-It
• Bob's 27
• Baseball
• Knockout
• Gotcha

UP TO SIX PLAYERS
Add everyone at the board. Good Arrows keeps the throwing order, lives, honours and who's armed, so nobody has to.

BUILT FOR THE OCHE
• Big keys you can hit with one thumb, dart still in hand
• Checkout routes for every finish from 170 down
• Undo for the dart you tapped wrong
• A colour-coded golf scorecard, editable after the fact
• Celebrations for the big moments, and a roast for the bad ones
• A running record of who actually wins

Every game explains its own rules before you start, so a new player can pick it up between throws.

FREE AND PRO
301, 501, 701 and Count-Up are free, with no ads. Good Arrows Pro unlocks the other ten games, monthly, yearly or once for life.

Monthly and yearly plans renew automatically until cancelled. Cancel any time in Google Play, under Payments and subscriptions.

No account, no ads, no tracking. Privacy policy: https://goodarrow.app/privacy
```

**Graphics** (all in `resources/store/play/`):

| Asset | File | Play's rule |
|---|---|---|
| App icon | `icon-512.png` | 512 x 512 PNG, up to 1 MB. Play rounds the corners itself. |
| Feature graphic | `feature-1024x500.png` | 1024 x 500, no alpha |
| Phone screenshots | `screenshots/1080x2160/1-games.png` to `6-pro.png` | 2 to 8, no taller than 2:1. Upload in order. |
| Tablet screenshots | Skip | The app is phone-only and portrait |
| Video | Skip | Optional |

Re-render the icon with `npm run assets`, the feature graphic with `npm run header`, and the screenshots with `node scripts/make-store-shots.js --play`.

## 4. App content (Policy, App content)

**Privacy policy:** `https://goodarrow.app/privacy`

**App access:** All functionality is available without any access restrictions. The Pro games are behind a purchase, not a login, so no reviewer credentials are needed.

**Ads:** No, the app does not contain ads.

**Content rating** (IARC questionnaire):
- Email: `hello@lud.is`
- Category: All Other App Types
- Violence, sexuality, language, controlled substances, crude humour: No to all
- Gambling or simulated gambling: No. Darts scoring isn't gambling, and nothing is won.
- Users can interact or exchange content: No
- Shares location: No
- Digital purchases: Yes
- Expected result: Everyone / PEGI 3 / USK 0

**Target audience and content:**
- Age groups: 13–15, 16–17 and 18 and over. Leave the under-13 groups unticked so Google's Families policy doesn't apply. That policy would require RevenueCat to be on Google's certified SDK list for children.
- Could the listing unintentionally appeal to children: No

**News app:** No.

**Advertising ID:** No, the app doesn't use it. The build was checked: the manifest has no `AD_ID` permission.

**Government app:** No. **Financial features:** The app doesn't provide any financial features. **Health:** None.

**Data safety:**

| Question | Answer |
|---|---|
| Does the app collect or share any required user data types? | Yes |
| Is all data encrypted in transit? | Yes (RevenueCat is HTTPS only) |
| Account creation | The app doesn't allow users to create an account |
| Data deletion requests | Optional. Point users to `hello@lud.is`. |

Declare two data types, both **collected, not shared**. RevenueCat processes them on your behalf, which Play doesn't count as sharing.

| Data type | Collected | Shared | Ephemeral | Required | Purpose |
|---|---|---|---|---|---|
| Financial info: Purchase history | Yes | No | No | Required | App functionality |
| Device or other IDs | Yes | No | No | Required | App functionality |

The ID is the random installation ID RevenueCat uses in place of an account. Player names, scores and settings stay on the phone and are not collected. RevenueCat has a Play data safety guide; check it before submitting, as the form changes now and then.

## 5. Products (Monetise, Products)

These need a build with the billing permission uploaded to any track first, and the payments profile set up. Prices are the ones the app uses in its demo; match whatever is live on the App Store.

**Subscriptions.** Make two, to mirror the App Store product IDs. Product IDs are permanent and can't be reused.

| Product ID | Name (55) | Base plan ID | Billing period | Price (US) | Renewal |
|---|---|---|---|---|---|
| `monthly` | `Good Arrows Pro (Monthly)` | `monthly` | 1 month | $0.99 | Auto-renewing |
| `yearly` | `Good Arrows Pro (Yearly)` | `yearly` | 1 year | $7.99 | Auto-renewing |

Benefits (up to 4, 40 characters each), the same on both:
- `All ten Pro games`
- `Golf, Cricket, Killer and Shanghai`
- `Plus Halve-It, Bob's 27 and more`
- `Up to six players per game`

No free trial and no introductory offer, to match iOS. Leave grace period and account hold at Play's defaults. Activate each base plan once saved; a draft base plan can't be bought.

**One-time product:**

| Product ID | Name | Description (200) | Price (US) |
|---|---|---|---|
| `lifetime` | `Good Arrows Pro (Lifetime)` | `All ten Pro games, for good. Golf, Cricket, Killer, Shanghai, Halve-It, Bob's 27, Baseball, Knockout, Gotcha and Around the Clock. One payment.` | $19.99 |

Let Play convert prices to other countries, then round any that look odd.

## 6. RevenueCat

1. In the existing Good Arrows project, add a Google Play app with package `com.ludis.goodarrow`.
2. Service credentials: if Breach already uses a Google Cloud service account with RevenueCat, reuse its JSON key. In Play Console, Users and permissions, give that account access to Good Arrows with View app information, View financial data, and Manage orders and subscriptions. Validation can take up to 36 hours.
3. Real-time developer notifications: copy the Pub/Sub topic RevenueCat shows into Play Console, Monetisation setup. Without it, renewals and cancellations show up late.
4. Import `monthly:monthly`, `yearly:yearly` and `lifetime`. Mark `lifetime` as non-consumable.
5. Attach all three to the `good_arrow_pro` entitlement, and add them to the `default` offering's Monthly, Annual and Lifetime packages, next to the App Store ones.
6. Copy the public Play key (starts `goog_`) into `revenueCatKeyAndroid` in `www/config.js`.

## 7. Releasing

1. **Upload key.** Create it yourself with `keytool` and keep two backups off this repo. Turn on Play App Signing when Play asks (the default).
2. **Signing config.** Add a release signing config to `android/app/build.gradle` that reads the keystore path and passwords from a gitignored `android/keystore.properties`.
3. **Version.** Bump `versionCode` in `android/app/build.gradle` for every upload. Play rejects a repeat. Keep `versionName` in step with `www/config.js`.
4. **Build:** `npm run build:android`. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
5. **Internal testing first.** Add your own Gmail under Settings, License testing, so test purchases go through without a real charge. Test buying, restoring and cancelling.
6. **Closed testing**, if the developer account is a personal one created after November 2023: 12 or more testers opted in for 14 days in a row before Production unlocks. Organisation accounts skip this.
7. **Production.** Roll out with the release notes `First release.`
