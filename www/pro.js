/* Subscription state, backed by RevenueCat on device.
   Pro.state = { active, price, available, busy }. Subscribe to changes with Pro.onChange(fn). */
window.Pro = (function () {
  'use strict';
  var cfg = window.APP_CONFIG, CACHE = 'goodarrows.pro';
  var cap = window.Capacitor;
  var native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var RC = native && cap.registerPlugin ? cap.registerPlugin('Purchases') : null;
  var state = { active: false, price: null, available: false, busy: false };
  var listeners = [], pkg = null;

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

  function init() {
    // Browser preview only: ?pro=1 unlocks Pro so the paid features can be tested without a store.
    if (!native) {
      if (/[?&]pro=1\b/.test(location.search)) state.active = true;
      emit();
      return Promise.resolve(state);
    }
    // Start from the last known answer so a subscriber is not locked out while offline.
    try { state.active = localStorage.getItem(CACHE) === '1'; } catch (e) {}
    if (!RC || !cfg.revenueCatKey) { emit(); return Promise.resolve(state); }
    return RC.configure({ apiKey: cfg.revenueCatKey })
      .then(function () {
        state.available = true;
        if (RC.addCustomerInfoUpdateListener) RC.addCustomerInfoUpdateListener(apply);
        return RC.getCustomerInfo();
      })
      .then(function (r) { apply(r && r.customerInfo); return RC.getOfferings(); })
      .then(function (o) {
        var cur = o && o.current;
        pkg = cur && (cur.monthly || (cur.availablePackages || [])[0]) || null;
        state.price = pkg && pkg.product && pkg.product.priceString || null;
        emit(); return state;
      })
      .catch(function () { emit(); return state; });
  }

  /** Resolves 'purchased', 'cancelled' or 'unavailable'. Rejects with a message on a real failure. */
  function purchase() {
    if (!RC || !pkg) return Promise.resolve('unavailable');
    busy(true);
    return RC.purchasePackage({ aPackage: pkg }).then(function (r) {
      busy(false); apply(r && r.customerInfo); return state.active ? 'purchased' : 'cancelled';
    }, function (e) {
      busy(false);
      if (cancelled(e)) return 'cancelled';
      throw new Error(e && e.message || 'The purchase could not be completed.');
    });
  }

  /** Resolves 'restored', 'none' or 'unavailable'. Rejects with a message on a real failure. */
  function restore() {
    if (!RC) return Promise.resolve('unavailable');
    busy(true);
    return RC.restorePurchases().then(function (r) {
      busy(false); apply(r && r.customerInfo); return state.active ? 'restored' : 'none';
    }, function (e) {
      busy(false);
      throw new Error(e && e.message || 'Purchases could not be restored.');
    });
  }

  return {
    state: state, native: native, init: init, purchase: purchase, restore: restore,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
