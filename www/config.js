/* App configuration. Everything marked TODO must be filled in before submitting to the App Store. */
window.APP_CONFIG = {
  appName: 'Good Arrows',
  version: '1.0.0',

  // RevenueCat. The public iOS SDK key starts with "appl_". It is safe to ship in the app.
  revenueCatKey: '',                     // TODO: RevenueCat > Project settings > API keys > App Store
  entitlement: 'pro',                    // RevenueCat entitlement identifier that unlocks Golf
  fallbackPrice: '$0.99',                // shown only until the real price loads from the store

  // Links shown on the paywall and in Settings. Apple requires both on the paywall.
  privacyUrl: 'https://goodarrow.app/privacy', // served from docs/privacy/index.html by GitHub Pages
  termsUrl: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', // Apple's standard EULA
  manageUrl: 'https://apps.apple.com/account/subscriptions',
  supportEmail: 'hello@lud.is'
};
