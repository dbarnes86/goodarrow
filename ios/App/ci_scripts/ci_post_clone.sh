#!/bin/sh
# Xcode Cloud runs this right after cloning, before it resolves Swift packages and builds.
# The app's web code and the Capacitor and RevenueCat packages come from npm, so install them
# and copy the web app into the iOS project, exactly as `npm install && npm run sync` does locally.
set -eu

cd "$CI_PRIMARY_REPOSITORY_PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js"
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install node@22
  brew link --overwrite --force node@22
fi
echo "Node $(node --version), npm $(npm --version)"

npm ci --no-audit --no-fund
npm run sync
