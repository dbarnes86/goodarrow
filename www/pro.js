/* Purchases, backed by RevenueCat on device.
   Pro.state = { active, packages, available, busy }. Subscribe to changes with Pro.onChange(fn).
   The paywall and the customer centre are RevenueCat's native screens, designed in the RevenueCat
   dashboard; the app's own paywall sheet is the fallback when they cannot be shown. */
window.Pro = (function () {
  'use strict';
  var cfg = window.APP_CONFIG, CACHE = 'goodarrows.pro';
  var cap = window.Capacitor;
  var native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var RC = native && cap.registerPlugin ? cap.registerPlugin('Purchases') : null;
  var UI = native && cap.registerPlugin ? cap.registerPlugin('RevenueCatUI') : null;
  var state = { active: false, packages: [], available: false, busy: false };
  var listeners = [], raw = {}, starting = null;
  var ORDER = ['MONTHLY', 'ANNUAL', 'LIFETIME'];
  var LABEL = { MONTHLY: 'Monthly', ANNUAL: 'Yearly', LIFETIME: 'Lifetime' };
  var TERM = { MONTHLY: 'a month', ANNUAL: 'a year', LIFETIME: 'once' };

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }
  function setActive(on) {
    on = !!on;
    try { localStorage.setItem(CACHE, on ? '1' : '0'); } catch (e) {}
    if (state.active !== on) { state.active = on; emit(); }
  }
  function apply(info) {
    var act = info && info.entitlements && info.entitlements.active;
    setActive(act && act[cfg.entitlement]);
  }
  function cancelled(e) { return !!e && (e.userCancelled === true || e.code === '1' || e.code === 1); }
  function busy(on) { state.busy = on; emit(); }
  function message(e, fallback) { return new Error(e && e.message || fallback); }

  function loadOfferings() {
    return RC.getOfferings().then(function (o) {
      var cur = o && o.current, list = cur && cur.availablePackages || [];
      raw = {};
      state.packages = list.map(function (p) {
        raw[p.identifier] = p;
        return { id: p.identifier, type: p.packageType, label: LABEL[p.packageType] || p.product.title || p.identifier,
          price: p.product.priceString, term: TERM[p.packageType] || '' };
      }).sort(function (a, b) {
        var x = ORDER.indexOf(a.type), y = ORDER.indexOf(b.type);
        return (x < 0 ? 9 : x) - (y < 0 ? 9 : y);
      });
      emit();
    });
  }
  function refresh() {
    if (!RC || !state.available) return Promise.resolve(state);
    return RC.getCustomerInfo().then(function (r) { apply(r && r.customerInfo); return state; }, function () { return state; });
  }

  function init() {
    // Browser preview only: ?pro=1 unlocks Pro so the paid features can be tested without a store.
    if (!native) {
      if (/[?&]pro=1\b/.test(location.search)) state.active = true;
      emit();
      return Promise.resolve(state);
    }
    // Start from the last known answer so a customer is not locked out while offline.
    try { state.active = localStorage.getItem(CACHE) === '1'; } catch (e) {}
    if (!RC || !cfg.revenueCatKey) { emit(); return Promise.resolve(state); }
    if (starting) return starting;
    starting = (state.available ? Promise.resolve() : RC.configure({ apiKey: cfg.revenueCatKey }).then(function () {
      state.available = true;
      // Fires whenever RevenueCat learns something new: a renewal, a refund, a purchase on another device.
      if (RC.addCustomerInfoUpdateListener) RC.addCustomerInfoUpdateListener(apply);
    }))
      .then(refresh).then(loadOfferings)
      .catch(function () {})
      .then(function () { starting = null; emit(); return state; });
    return starting;
  }

  /** Buy one package from the fallback sheet. Resolves 'purchased', 'cancelled' or 'unavailable'. */
  function purchase(id) {
    var pkg = raw[id];
    if (!RC || !pkg) return Promise.resolve('unavailable');
    busy(true);
    return RC.purchasePackage({ aPackage: pkg }).then(function (r) {
      busy(false); apply(r && r.customerInfo); return state.active ? 'purchased' : 'cancelled';
    }, function (e) {
      busy(false);
      if (cancelled(e)) return 'cancelled';
      throw message(e, 'The purchase could not be completed.');
    });
  }

  /** Resolves 'restored', 'none' or 'unavailable'. Rejects with a message on a real failure. */
  function restore() {
    if (!RC || !state.available) return Promise.resolve('unavailable');
    busy(true);
    return RC.restorePurchases().then(function (r) {
      busy(false); apply(r && r.customerInfo); return state.active ? 'restored' : 'none';
    }, function (e) { busy(false); throw message(e, 'Purchases could not be restored.'); });
  }

  /** Show RevenueCat's paywall. Resolves 'purchased', 'cancelled', or 'fallback' when it could not be shown. */
  function paywall() {
    if (!UI || !state.available) return Promise.resolve('fallback');
    return UI.presentPaywall().then(function (r) {
      var res = r && r.result;
      if (res === 'ERROR' || res === 'NOT_PRESENTED') return 'fallback';
      return refresh().then(function () { return state.active ? 'purchased' : 'cancelled'; });
    }, function () { return 'fallback'; });
  }

  /** Show RevenueCat's customer centre (cancel, refund, restore). Resolves false when it could not be shown. */
  function manage() {
    if (!UI || !state.available) return Promise.resolve(false);
    return UI.presentCustomerCenter().then(function () { return refresh(); }).then(function () { return true; }, function () { return false; });
  }

  return {
    state: state, native: native, init: init, refresh: refresh,
    purchase: purchase, restore: restore, paywall: paywall, manage: manage,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
