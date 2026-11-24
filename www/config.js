/* App configuration. Everything marked TODO must be filled in before submitting to the App Store. */
window.APP_CONFIG = {
  appName: 'Good Arrows',
  version: '1.0.1',

  // RevenueCat. SDK keys are public by design and safe to ship in the app.
  // RevenueCat's public App Store SDK key. For pretend purchases with no App Store set-up, swap in the
  // project's Test Store key (starts "test_") while developing, but never ship a build with it.
  revenueCatKey: 'appl_OgpUkUiOlvUMYMYDTLXixHuNtyd',
  // RevenueCat's public Google Play SDK key, for the Android build.
  revenueCatKeyAndroid: 'goog_FtlWxbAOMCVejgSTPVtlfCzKnBl',
  entitlement: 'good_arrow_pro',         // RevenueCat entitlement identifier that unlocks the Pro games
  nativePaywall: false,                  // true shows the paywall designed in the RevenueCat dashboard instead of the app's own

  // Links shown on the paywall and in Settings. Apple requires both on the paywall.
  privacyUrl: 'https://goodarrow.app/privacy', // served from docs/privacy/index.html by GitHub Pages
  termsUrl: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', // Apple's standard EULA
  manageUrl: 'https://apps.apple.com/account/subscriptions',
  // Android: Google Play has no standard EULA, so no terms link is shown there. Set one if goodarrow.app gets a terms page.
  termsUrlAndroid: '',
  manageUrlAndroid: 'https://play.google.com/store/account/subscriptions',
  supportEmail: 'hello@lud.is'
};
