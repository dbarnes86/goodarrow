/* App configuration. Everything marked TODO must be filled in before submitting to the App Store. */
window.APP_CONFIG = {
  appName: 'Good Arrows',
  version: '1.0.0',

  // RevenueCat. SDK keys are public by design and safe to ship in the app.
  // TODO before submitting: this is a RevenueCat Test Store key, for development only. Replace it with the
  // App Store key (starts "appl_") from RevenueCat > Project settings > API keys. Apple rejects apps that ship a test key.
  revenueCatKey: 'test_PoVVHKuPDHbqBYkTFWdEHbIdhxd',
  entitlement: 'good_arrow_pro',         // RevenueCat entitlement identifier that unlocks Golf

  // Links shown on the paywall and in Settings. Apple requires both on the paywall.
  privacyUrl: 'https://goodarrow.app/privacy', // served from docs/privacy/index.html by GitHub Pages
  termsUrl: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', // Apple's standard EULA
  manageUrl: 'https://apps.apple.com/account/subscriptions',
  supportEmail: 'hello@lud.is'
};
