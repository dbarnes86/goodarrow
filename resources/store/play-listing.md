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

The text lives in `resources/store/play/listing/`, one file per field, and the **Play Store setup** workflow uploads it (section 8). To paste it by hand instead:

| Field | File |
|---|---|
| App name (30) | `title.txt`: `Good Arrows: Darts Games`, to match the App Store. Play Console currently says "Dart games". |
| Short description (80) | `short_description.txt` |
| Full description (4000) | `full_description.txt` |
| Release notes (500) | `release_notes.txt`, used by the release workflow |

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

The **Play Store setup** workflow creates all three from `resources/store/play/play.json` (section 8). The tables below are the same values, for checking or for doing it by hand.

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
2. **Signing config.** Done: `android/app/build.gradle` reads the keystore from a gitignored `android/keystore.properties`. CI writes that file from secrets.
3. **Version.** The release workflow sets `versionCode` to one above Play's highest and takes `versionName` from `www/config.js`. For a build by hand, pass `-PversionCode=N` to Gradle, as Play rejects a repeat.
4. **Build:** `npm run build:android`. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
5. **Internal testing first.** Add your own Gmail under Settings, License testing, so test purchases go through without a real charge. Test buying, restoring and cancelling.
6. **Closed testing.** Ludis Entertainment is an organisation account, so the 12-tester, 14-day rule doesn't apply. Use closed testing (Alpha) for your own checks, then promote.
7. **Production.** Roll out with the release notes `First release.`

## 8. Automation (GitHub Actions)

Two workflows talk to the Google Play Developer API with a service account, so uploads and product setup don't need anyone in Play Console. The code is `scripts/play.js`, with no dependencies.

**One-off setup**

1. **Service account.** In Google Cloud (the same project as Breach's is fine), create a service account and a JSON key, and enable the Google Play Android Developer API. In Play Console, Users and permissions, invite its email and give it Good Arrows with: Release apps to testing tracks, Manage testing tracks and edit tester lists, Manage store presence, and View app information. Add View financial data and Manage orders and subscriptions too if RevenueCat will use the same account.
2. **GitHub secrets** (repo Settings, Secrets and variables, Actions):
   - `PLAY_SERVICE_ACCOUNT_JSON`: the whole JSON key file
   - `ANDROID_KEYSTORE_BASE64`: `base64 -i ~/keys/goodarrow-upload.jks | pbcopy` on a Mac
   - `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`
   - `ANDROID_KEY_ALIAS`: only if the alias isn't `upload`
3. **First release.** The workflow uploaded the app's first bundle (versionCode 1) through the API on 24 November 2026. Play kept it as a draft until the app's first review, so it has to be rolled out in Play Console once.

**Android release** (`.github/workflows/android-release.yml`): push a tag that matches the version in `www/config.js`, for example `git tag v1.0.1 && git push origin v1.0.1`, or run it from the Actions tab and choose a track. It builds, signs, sets the versionCode and uploads to Closed testing (Alpha) with the notes in `release_notes.txt`. Until the app's first release has been reviewed, Play only accepts drafts, so the workflow saves a draft and you press Roll out in Play Console. Production is always a manual promotion.

**Play Store setup** (`.github/workflows/play-store-setup.yml`): run it from the Actions tab. Leave Dry run ticked the first time: it signs in, reads the app and prices everything without saving. Then run it again unticked. It creates the subscriptions and the lifetime product with Google's price conversion from the US price, activates them, and uploads the listing text and graphics. Products that already exist are skipped; change their prices in Play Console. It can't fill in the App content forms (section 4); those stay manual.

