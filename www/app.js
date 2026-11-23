/* UI. Holds the app state, wires the controls and renders. Game rules live in engine.js. */
(function () {
  'use strict';
  var E = window.Engine, C = window.APP_CONFIG, Pro = window.Pro, Store = window.Store;
  var $ = function (id) { return document.getElementById(id); };
  var cap = window.Capacitor;
  var haptics = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.registerPlugin ? cap.registerPlugin('Haptics') : null;

  var S = null;            // persisted state
  var mod = 1;             // X01 multiplier in hand: 1 single, 2 double, 3 treble
  var edit = null;         // golf cell being corrected: {p, k}
  var hold = false;        // golf result held back while the ending plays
  var armed = '';          // which two-tap confirmation is primed
  var armTimer = 0;

  function fresh() {
    var now = Date.now();
    return {
      v: 1, names: ['Player 1', 'Player 2'], game: 'x01',
      set: { start: 301, dblOut: true, holes: 18, roast: true },
      x01: E.newX01({ start: 301, dblOut: true, id: now }),
      golf: E.newGolf({ holes: 18, id: now + 1 }),
      ux: [], ug: [], hist: []
    };
  }
  function adopt(saved) {
    var f = fresh();
    if (!saved || saved.v !== 1 || !saved.x01 || !saved.golf) return f;
    Object.keys(f).forEach(function (k) { if (saved[k] === undefined) saved[k] = f[k]; });
    Object.keys(f.set).forEach(function (k) { if (saved.set[k] === undefined) saved.set[k] = f.set[k]; });
    return saved;
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nm(p) { return esc(S.names[p]); }
  /** Golf is the paid game: a lapsed subscriber falls back to the free one without losing their round. */
  function isGolf() { return S.game === 'golf' && Pro.state.active; }
  function cls(v) { return v < 0 ? (v < -1 ? ' neg neg2' : ' neg') : (v > 0 ? (v > 1 ? ' pos pos2' : ' pos') : ''); }
  function press(el, on) { el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function tap(style) { if (haptics) try { haptics.impact({ style: style || 'LIGHT' }).catch(function () {}); } catch (e) {} }
  function buzz(type) { if (haptics) try { haptics.notification({ type: type }).catch(function () {}); } catch (e) {} }

  /* ---------- scoreboard of finished games ---------- */
  function syncHist() {
    var x = S.x01, g = S.golf;
    if (!x.id) x.id = Date.now();
    if (!g.id) g.id = Date.now() + 1;
    S.hist = S.hist.filter(function (h) { return h.id !== x.id && h.id !== g.id; });
    if (g.done && !g.noHist) S.hist.push({ id: g.id, game: 'golf', a: E.sum(g.sc[0]), b: E.sum(g.sc[1]), holes: g.holes });
    if (x.winner >= 0 && !x.noHist) S.hist.push({ id: x.id, game: 'x01', start: x.start, w: x.winner, darts: x.darts[x.winner] });
    S.hist.sort(function (p, q) { return q.id - p.id; });
    if (S.hist.length > 300) S.hist.length = 300;
  }
  function save() {
    syncHist();
    if (S.ux.length > 60) S.ux = S.ux.slice(-60);
    if (S.ug.length > 80) S.ug = S.ug.slice(-80);
    Store.save(S);
  }

  /* ---------- banners and confetti ---------- */
  /* Banners queue within one action (score, then hole change) but a newer action pre-empts older
     banners, so fast scoring never leaves the animations trailing behind the game. */
  var fxq = [], fxbusy = false, fxCur = null, fxTimer = 0, batch = 0, lastRoast = -1;
  function act() { batch++; }
  function fxClear() {
    batch++;
    fxq.forEach(function (q) { if (q.cb) q.cb(); });
    fxq = [];
    if (fxbusy) { clearTimeout(fxTimer); fxnext(); }
  }
  var roasts = [
    '{n}, the number is the bit you are meant to hit.',
    'Three darts and that is the one you kept?',
    'Were you aiming at a different pub, {n}?',
    'Bold strategy, {n}. {o} says thanks.',
    'Somewhere a dartboard is laughing at you.',
    'Have you thought about bowling, {n}?',
    'That one was closer to the bar than the board.',
    '{o} did not even have to try there.'
  ];
  function roast(p) {
    var i; do { i = Math.floor(Math.random() * roasts.length); } while (i === lastRoast);
    lastRoast = i;
    return roasts[i].replace('{n}', S.names[p]).replace('{o}', S.names[1 - p]);
  }
  /** Queue a banner. kind: good | bad | info | win. m is the size of the moment, 1 to 4. */
  function flash(text, kind, m, sub, dur, cb) {
    fxq = fxq.filter(function (q) { if (q.b === batch) return true; if (q.cb) q.cb(); return false; });
    fxq.push({ t: text, k: kind, m: m || 2, s: sub || '', d: dur || 0, cb: cb, b: batch });
    if (!fxbusy) fxnext();
    else if (fxCur && fxCur.b !== batch) { clearTimeout(fxTimer); fxnext(); }
  }
  function fxnext() {
    var f = $('bn'), box = $('bnb'), it = fxq.shift();
    if (!it) { fxbusy = false; fxCur = null; f.hidden = true; return; }
    fxbusy = true; fxCur = it;
    var d = it.d || (1000 + it.m * 350), h = '<b></b><small></small>', i, n, bad = it.k === 'bad';
    if (it.k !== 'info') {
      if (!bad && it.m >= 2) h += '<i class="ring"></i>';
      if (!bad && it.m >= 3) h += '<i class="ring" style="animation-delay:.18s"></i>';
      if (it.m >= 3) {
        n = it.m * 10;
        for (i = 0; i < n; i++) {
          var a = Math.random() * 6.283, r = 60 + Math.random() * 40 * it.m;
          h += '<i class="dot" style="--dx:' + Math.round(Math.cos(a) * r) + 'px;--dy:' +
            Math.round(bad ? 90 + Math.random() * 120 : Math.sin(a) * r) + 'px;animation-delay:' + (Math.random() * .15).toFixed(2) + 's"></i>';
        }
      }
      if (it.m >= (bad ? 3 : 4)) h += '<i class="tint"></i>';
    }
    f.hidden = true; f.className = 'bn ' + it.k;
    f.style.setProperty('--m', it.m); f.style.setProperty('--d', d + 'ms');
    box.innerHTML = h;
    box.childNodes[0].textContent = it.t;
    box.childNodes[1].textContent = it.s; box.childNodes[1].hidden = !it.s;
    void f.offsetWidth; f.hidden = false;
    if (it.cb) it.cb();
    if (it.k === 'win') { party(d + 600); buzz('SUCCESS'); }
    fxTimer = setTimeout(fxnext, d);
  }
  function party(ms) {
    var c = $('cv');
    if (!c.getContext || (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches)) return;
    var x = c.getContext('2d'), W = c.width = window.innerWidth, H = c.height = window.innerHeight;
    var cs = getComputedStyle(document.documentElement);
    var cols = ['--green', '--red', '--gold', '--ink'].map(function (v) { return cs.getPropertyValue(v).trim() || '#1d6f4c'; }).concat(['#4a90d9']);
    var P = [], t0 = performance.now();
    function burst(cx, cy, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283, s = 4 + Math.random() * 9;
        P.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 5, r: 4 + Math.random() * 5, c: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - .5) * .4 });
      }
    }
    c.hidden = false; burst(W * .5, H * .3, 90);
    setTimeout(function () { burst(W * .2, H * .4, 60); }, 500);
    setTimeout(function () { burst(W * .8, H * .4, 60); }, 900);
    setTimeout(function () { burst(W * .5, H * .25, 90); }, 1500);
    (function tick(now) {
      var el = now - t0, i, p; x.clearRect(0, 0, W, H);
      if (el < ms - 1500 && Math.random() < .5) P.push({ x: Math.random() * W, y: -10, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, r: 4 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)], rot: 0, vr: (Math.random() - .5) * .3 });
      for (i = P.length - 1; i >= 0; i--) {
        p = P[i]; p.vy += .18; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y > H + 20) { P.splice(i, 1); continue; }
        x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = p.c; x.fillRect(-p.r, -p.r * .5, p.r * 2, p.r); x.restore();
      }
      if (el < ms + 5000 && (el < ms || P.length)) requestAnimationFrame(tick);
      else { x.clearRect(0, 0, W, H); c.hidden = true; }
    })(t0);
  }

  /* ---------- X01 actions ---------- */
  function throwDart(n, m) {
    var x = S.x01; if (x.winner >= 0) return;
    act(); S.ux.push(JSON.stringify(x));
    var ev = E.x01Throw(x, n, m); mod = 1;
    if (!ev) { S.ux.pop(); return; }
    tap(ev.type === 'bust' ? 'HEAVY' : 'LIGHT');
    if (ev.type === 'bust') flash('Bust', 'bad', 2, S.names[ev.player] + ' stays on ' + x.score[ev.player]);
    else if (ev.type === 'turn' && ev.scored >= 100) flash(ev.scored + '!', 'good', ev.scored >= 180 ? 4 : (ev.scored >= 140 ? 3 : 2), S.names[ev.player]);
    else if (ev.type === 'win') flash(S.names[ev.player] + ' wins', 'win', 4, 'Leg out in ' + ev.darts + ' darts', 4200);
    save(); render();
  }
  function undoX() { if (!S.ux.length) return; fxClear(); S.x01 = JSON.parse(S.ux.pop()); mod = 1; save(); render(); }
  function nextLeg() {
    S.ux.push(JSON.stringify(S.x01));
    S.x01 = E.x01Next(S.x01, { start: S.set.start, dblOut: S.set.dblOut, id: Date.now() });
    save(); render();
  }

  /* ---------- golf actions ---------- */
  var GOOD = ['Birdie', 'Eagle', 'Albatross', 'Condor'], BAD = ['Bogey', 'Double bogey', 'Triple bogey'];
  function golfEvents(evs) {
    evs.forEach(function (ev) {
      var who;
      if (ev.type === 'score') {
        who = S.names[ev.player];
        if (ev.score < 0) flash(GOOD[Math.min(-ev.score, 4) - 1], 'good', Math.min(-ev.score, 4), who + ' ' + E.fmt(ev.score));
        else if (ev.score === 2 && S.set.roast) flash('Double bogey', 'bad', 2, roast(ev.player), 3800);
        else if (ev.score > 0) flash(BAD[Math.min(ev.score, 3) - 1], 'bad', Math.min(ev.score, 3), who + ' ' + E.fmt(ev.score));
      } else if (ev.type === 'hole') {
        flash(ev.lead < 0 ? 'All square' : S.names[ev.lead] + (ev.lead !== ev.prevLead ? ' takes the lead' : ' leads by ' + ev.margin),
          'info', 2, S.names[ev.first] + ' to shoot first on hole ' + ev.hole, 2600);
      } else if (ev.type === 'done') {
        hold = true;
        var reveal = function () { hold = false; render(); };
        var line = S.names[0] + ' ' + E.fmt(ev.a) + ' · ' + S.names[1] + ' ' + E.fmt(ev.b);
        flash('And the winner is…', 'info', 2, '', 1600);
        if (ev.winner < 0) flash('All square', 'info', 2, line + '. Play another to settle it.', 3600, reveal);
        else flash(S.names[ev.winner] + ' wins', 'win', 4, 'By ' + ev.margin + ' · ' + line, 4800, reveal);
      }
    });
  }
  function gSnap() { S.ug.push(JSON.stringify(S.golf)); }
  function gUndo() { if (!S.ug.length) return; fxClear(); S.golf = JSON.parse(S.ug.pop()); edit = null; save(); render(); }
  function gScore(score) {
    var g = S.golf;
    if (edit) {
      var e = edit; edit = null; gSnap();
      if (!E.golfEdit(g, e.p, e.k, score)) S.ug.pop();
      tap(); save(); render(); return;
    }
    if (g.done) return;
    act(); gSnap(); tap(); golfEvents(E.golfDart(g, score)); save(); render();
  }
  function gKeep() {
    if (edit) { edit = null; render(); return; }
    var g = S.golf; if (g.done || g.pend == null) return;
    act(); gSnap(); tap('MEDIUM'); golfEvents(E.golfKeep(g)); save(); render();
  }
  function newRound() {
    S.golf = E.newGolf({ holes: S.set.holes, starter: S.golf.starter, id: Date.now() });
    fxClear(); S.ug = []; edit = null; hold = false;
  }

  /* ---------- render ---------- */
  function renderX() {
    var x = S.x01, p = x.active;
    $('info').textContent = 'Leg ' + x.leg + ' · ' + S.names[x.starter] + ' threw first';
    $('players').innerHTML = [0, 1].map(function (i) {
      var avg = E.x01Avg(x, i);
      return '<div class="player' + (i === x.active && x.winner < 0 ? ' on' : '') + '">' +
        '<div class="row"><span class="name">' + nm(i) + '</span><span class="tag">Throwing</span></div>' +
        '<div class="score">' + x.score[i] + '</div>' +
        '<div class="meta">Legs ' + x.legs[i] + ' · Avg ' + (avg == null ? '–' : avg.toFixed(1)) + '</div>' +
        '<div class="meta">' + (esc(x.last[i]) || '&nbsp;') + '</div></div>';
    }).join('');
    var s = '', tot = 0, k, d;
    for (k = 0; k < 3; k++) { d = x.turn[k]; if (d) tot += d.v; s += '<div class="slot' + (d ? ' hit' : '') + '">' + (d ? E.dartLabel(d) : '') + '</div>'; }
    $('slots').innerHTML = s + '<div class="total"><small>Turn</small><b>' + tot + '</b></div>';

    var hint = $('hint'); hint.className = 'hint';
    if (x.winner < 0) {
      var left = 3 - x.turn.length, c = E.checkout(x.score[p], left, x.dblOut), out = c ? nm(p) + ' can go out: <b>' + c.join(' · ') + '</b>' : '';
      if (x.bust >= 0 && !x.turn.length) { hint.className = 'hint bust'; hint.innerHTML = '<b>Bust.</b> ' + nm(x.bust) + ' stays on ' + x.score[x.bust] + '. ' + out; }
      else if (c) hint.innerHTML = out;
      else if (x.score[p] <= 170) hint.textContent = 'No finish with ' + left + ' dart' + (left > 1 ? 's' : '') + ' left.';
      else hint.textContent = S.names[p] + ' to throw. ' + (x.score[p] - 170) + ' more to reach a finish.';
    } else hint.textContent = '';

    [1, 2, 3].forEach(function (m) { press($('mod' + m), mod === m); });
    $('k25').disabled = $('kbull').disabled = $('kmiss').disabled = mod !== 1;
    $('kundo').disabled = !S.ux.length;
    var w = $('win');
    if (x.winner >= 0) {
      w.hidden = false; $('pad').hidden = true;
      w.innerHTML = '<h2>' + nm(x.winner) + ' takes the leg</h2><p>Out in ' + x.darts[x.winner] + ' darts. Legs: ' + nm(0) + ' ' + x.legs[0] + ', ' + nm(1) + ' ' + x.legs[1] + '.</p>' +
        '<div class="btns"><button type="button" data-a="next">Next leg</button><button type="button" class="ghost" data-a="undo">Undo last dart</button></div>';
    } else { w.hidden = true; $('pad').hidden = false; }
  }

  function renderG() {
    var g = S.golf, ld = E.golfLead(g), live = !g.done, k, p, v, ed;
    $('info').textContent = g.done ? 'Round finished' : 'Hole ' + g.hole + ' of ' + g.holes;
    var t = '<table><tr><th>Hole</th>';
    for (k = 1; k <= g.holes; k++) t += '<th' + (k === g.hole && live ? ' class="hc"' : '') + '>' + k + '</th>';
    t += '</tr>';
    for (p = 0; p < 2; p++) {
      var tot = E.sum(g.sc[p]);
      t += '<tr' + (p === g.active && live ? ' class="on"' : '') + '><td><span class="nm">' + nm(p) + '</span><span class="tot' + cls(tot) + (ld.who === p ? ' top' : '') + '">' + E.fmt(tot) + '</span></td>';
      for (k = 1; k <= g.holes; k++) {
        v = g.sc[p][k - 1]; ed = edit && edit.p === p && edit.k === k;
        t += '<td' + (v != null ? ' data-p="' + p + '" data-k="' + k + '"' : '') + ' class="' +
          (ed ? 'edit' : (k === g.hole && p === g.active && live ? 'cur' : '') + cls(v)) + (v != null ? ' can' : '') + (k === g.hole && live ? ' hc' : '') + '">' + E.fmt(v) + '</td>';
      }
      t += '</tr>';
    }
    var card = $('gcard'); card.innerHTML = t + '</table>';
    var hc = card.querySelector('th.hc');
    if (hc && !edit) card.scrollLeft = hc.offsetLeft - (card.clientWidth + 100) / 2;

    $('glead').innerHTML = (g.done && hold) ? 'Round complete<small>Totting up the card</small>' :
      (ld.n ? (ld.who < 0 ? 'All square' : nm(ld.who) + (g.done ? ' wins by ' : ' leads by ') + ld.margin) : 'Level at the start') +
      '<small>' + (ld.n ? 'After ' + ld.n + ' hole' + (ld.n > 1 ? 's' : '') + ' · ' + nm(0) + ' ' + E.fmt(ld.a) + ' · ' + nm(1) + ' ' + E.fmt(ld.b) : 'Lowest total wins') + '</small>';

    $('ghint').innerHTML = edit ? 'Editing ' + nm(edit.p) + ', hole <b>' + edit.k + '</b>. Tap the right score, or cancel.' :
      g.done ? 'Tap any score on the card to correct it.' :
      nm(g.active) + ' on hole ' + g.hole + '. Aim at the <b>' + g.hole + '</b>. Dart ' + (g.dart + 1) + ' of 3.' +
      (g.pend != null ? ' Last dart: <b>' + E.fmt(g.pend) + '</b>. Keep it or throw again.' : '');
    var keep = $('gkeep');
    keep.disabled = !edit && g.pend == null;
    keep.textContent = edit ? 'Cancel edit' : (g.pend == null ? 'Keep' : 'Keep ' + E.fmt(g.pend));
    $('gundo').disabled = !S.ug.length;

    var w = $('gwin');
    if (g.done) {
      w.hidden = hold; $('gkeys').hidden = !edit;
      w.innerHTML = '<h2>' + (ld.who < 0 ? 'All square' : nm(ld.who) + ' wins by ' + ld.margin) + '</h2><p>' + nm(0) + ' ' + E.fmt(ld.a) + ', ' + nm(1) + ' ' + E.fmt(ld.b) + ' over ' + g.holes + ' holes. Lowest score wins.</p>' +
        '<div class="btns"><button type="button" data-a="new">New round</button><button type="button" class="ghost" data-a="undo">Undo last dart</button></div>';
    } else { w.hidden = true; $('gkeys').hidden = false; }
  }

  function renderHist(golf) {
    var rows = S.hist.filter(function (h) { return h.game === (golf ? 'golf' : 'x01'); }), w = [0, 0, 0], h = '<h2>Scoreboard</h2>';
    rows.forEach(function (r) { if (golf) w[r.a < r.b ? 0 : (r.b < r.a ? 1 : 2)]++; else w[r.w]++; });
    if (!rows.length) h += '<p>Finished ' + (golf ? 'rounds' : 'legs') + ' are listed here, newest first.</p>';
    else h += '<div class="tally"><span>' + nm(0) + '<b>' + w[0] + '</b></span><span>' + nm(1) + '<b>' + w[1] + '</b></span>' + (w[2] ? '<span>Level<b>' + w[2] + '</b></span>' : '') + '</div><ul>' +
      rows.slice(0, 30).map(function (r) {
        var d = new Date(r.id), ds = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return golf ? '<li><span>' + ds + ' · ' + r.holes + ' holes</span><span>' + nm(0) + ' <b class="' + cls(r.a) + '">' + E.fmt(r.a) + '</b> · ' + nm(1) + ' <b class="' + cls(r.b) + '">' + E.fmt(r.b) + '</b></span></li>'
          : '<li><span>' + ds + ' · ' + (r.start || 301) + '</span><span><b>' + nm(r.w) + '</b> out in ' + r.darts + ' darts</span></li>';
      }).join('') + '</ul>';
    $('hist').innerHTML = h;
  }

  function render() {
    var golf = isGolf();
    syncHist();
    $('title').textContent = golf ? 'Golf' : String(S.x01.start);
    $('tabX').textContent = String(S.x01.start);
    press($('tabX'), !golf); press($('tabG'), golf);
    $('lock').hidden = Pro.state.active;
    $('vx').hidden = golf; $('vg').hidden = !golf;
    var fresh = golf ? E.golfFresh(S.golf) : E.x01Fresh(S.x01), st = golf ? S.golf.starter : S.x01.starter;
    [0, 1].forEach(function (i) { var b = $('st' + i); b.textContent = S.names[i]; press(b, st === i); b.disabled = !fresh; });
    // Once a game is under way the set-up controls go, and the play area is drawn larger (see .playing in the CSS).
    $('tabs').hidden = $('stLab').hidden = $('starter').hidden = !fresh;
    document.body.classList.toggle('playing', !fresh);
    var r = $('reset');
    r.textContent = armed === 'reset' ? 'Tap again to wipe scores' : (golf ? 'New round' : 'New match');
    r.className = 'btn' + (armed === 'reset' ? ' armed' : '');
    if (golf) renderG(); else renderX();
    renderHist(golf);
  }

  /* ---------- sheets ---------- */
  function link(href, text) { return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + text + '</a>'; }
  function legalLinks() {
    return (C.privacyUrl ? link(C.privacyUrl, 'Privacy policy') : '') + (C.termsUrl ? link(C.termsUrl, 'Terms of use') : '');
  }
  function note(id, text, kind) { var n = $(id); n.textContent = text || ''; n.className = 'note' + (kind ? ' ' + kind : ''); }
  function renderSettings() {
    var xFresh = E.x01Fresh(S.x01), gFresh = E.golfFresh(S.golf), on = Pro.state.active;
    $('gsX').textContent = String(S.x01.start); press($('gsX'), !isGolf()); press($('gsG'), isGolf());
    press($('start301'), S.set.start === 301); press($('start501'), S.set.start === 501);
    $('startNote').textContent = S.set.start !== S.x01.start && !xFresh ? 'Applies from the next leg' : '';
    $('dblOut').checked = S.set.dblOut;
    $('h18').checked = S.set.holes === 18;
    $('holesNote').textContent = S.set.holes !== S.golf.holes && !gFresh ? 'Applies from the next round' : 'Off plays nine';
    $('roast').checked = S.set.roast;
    $('subState').textContent = on ? 'Pro is active. Golf is unlocked.' : '301 and 501 are free. Golf needs Pro.';
    $('setSub').textContent = on ? 'Manage purchase' : 'See Pro';
    $('setRestore').disabled = Pro.state.busy;
    var c = $('clearHist'); c.textContent = armed === 'clear' ? 'Tap again' : 'Clear'; c.className = 'btn' + (armed === 'clear' ? ' armed' : '');
    $('setLinks').innerHTML = legalLinks() + (C.supportEmail ? '<span>Support: ' + esc(C.supportEmail) + '</span>' : '');
    $('about').textContent = C.appName + ' ' + C.version;
  }
  function renderPay() {
    var plans = Pro.state.packages, off = Pro.state.busy ? ' disabled' : '';
    $('plans').innerHTML = plans.length ? plans.map(function (p) {
      return '<button type="button" class="plan" data-id="' + esc(p.id) + '"' + off + '><span>' + esc(p.label) + '</span><b>' + esc(p.price) + '</b><small>' + esc(p.term) + '</small></button>';
    }).join('') : (Pro.native ? '<button type="button" class="btn primary" data-retry' + off + '>Load prices again</button>'
      : '<button type="button" class="btn primary" disabled>Available in the iOS app</button>');
    if (!plans.length && Pro.native) note('payNote', 'The store could not be reached. Check your connection and try again.', 'err');
    $('payRestore').disabled = Pro.state.busy;
    $('payLinks').innerHTML = legalLinks();
  }
  function openSheet(id) {
    if (id === 'setSheet') { $('name0').value = S.names[0] === 'Player 1' ? '' : S.names[0]; $('name1').value = S.names[1] === 'Player 2' ? '' : S.names[1]; note('setNote', ''); renderSettings(); }
    if (id === 'paySheet') { note('payNote', ''); renderPay(); }
    $(id).hidden = false;
  }
  function closeSheet(id) { $(id).hidden = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); render(); }
  function arm(what) {
    armed = what; clearTimeout(armTimer);
    armTimer = setTimeout(function () { armed = ''; render(); renderSettings(); }, 3000);
  }
  function doRestore(noteId) {
    note(noteId, 'Checking…');
    Pro.restore().then(function (r) {
      if (r === 'restored') note(noteId, 'Pro restored.', 'ok');
      else if (r === 'none') note(noteId, 'No purchase found for this Apple Account.');
      else note(noteId, 'Purchases are only available in the iOS app.');
    }, function (e) { note(noteId, e.message, 'err'); });
  }

  function pickGame(g) {
    if (g === 'golf' && !Pro.state.active) { showPaywall(); return; }
    S.game = g; armed = ''; edit = null; save(); render();
  }
  function unlocked() {
    $('paySheet').hidden = true; S.game = 'golf'; save(); render();
    flash('Pro unlocked', 'good', 3, 'Golf is ready');
  }
  /** RevenueCat's paywall first; the app's own sheet if that cannot be shown (offline, or in a browser). */
  function showPaywall() {
    Pro.paywall().then(function (r) {
      if (r === 'purchased') unlocked();
      else if (r === 'fallback') openSheet('paySheet');
    });
  }

  /* ---------- wiring ---------- */
  function wire() {
    var h = '', i;
    for (i = 1; i <= 20; i++) h += '<button type="button" data-n="' + i + '">' + i + '</button>';
    $('nums').innerHTML = h;

    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) pickGame(b.dataset.g);
    });
    $('gameSw').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.g === 'golf' && !Pro.state.active) $('setSheet').hidden = true;
      pickGame(b.dataset.g); renderSettings();
    });
    $('mods').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var m = +b.dataset.m; mod = (mod === m ? 1 : m); render(); });
    $('nums').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) throwDart(+b.dataset.n, mod); });
    $('k25').addEventListener('click', function () { throwDart(25, 1); });
    $('kbull').addEventListener('click', function () { throwDart(25, 2); });
    $('kmiss').addEventListener('click', function () { throwDart(0, 1); });
    $('kundo').addEventListener('click', undoX);
    $('win').addEventListener('click', function (e) { var a = e.target.dataset.a; if (a === 'next') nextLeg(); if (a === 'undo') undoX(); });

    $('gkeys').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.id === 'gundo') gUndo(); else if (b.id === 'gkeep') gKeep(); else gScore(+b.dataset.s);
    });
    $('gcard').addEventListener('click', function (e) {
      var c = e.target.closest('td[data-k]'); if (!c) return;
      var p = +c.dataset.p, k = +c.dataset.k;
      edit = (edit && edit.p === p && edit.k === k) ? null : { p: p, k: k }; render();
    });
    $('gwin').addEventListener('click', function (e) {
      var a = e.target.dataset.a;
      if (a === 'undo') gUndo();
      if (a === 'new') { newRound(); save(); render(); }
    });

    $('starter').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; var n = +b.dataset.p;
      if (isGolf()) { if (!E.golfFresh(S.golf)) return; S.golf.starter = S.golf.first = S.golf.active = n; }
      else { if (!E.x01Fresh(S.x01)) return; S.x01.starter = S.x01.active = n; }
      save(); render();
    });
    $('reset').addEventListener('click', function () {
      if (armed !== 'reset') { arm('reset'); render(); return; }
      armed = '';
      if (isGolf()) newRound();
      else { fxClear(); S.x01 = E.newX01({ start: S.set.start, dblOut: S.set.dblOut, starter: S.x01.starter, id: Date.now() }); S.ux = []; }
      save(); render();
    });

    /* settings */
    $('openSet').addEventListener('click', function () { openSheet('setSheet'); });
    [0, 1].forEach(function (i) {
      $('name' + i).addEventListener('input', function (e) { S.names[i] = e.target.value.trim().slice(0, 14) || 'Player ' + (i + 1); save(); });
    });
    $('startSw').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.set.start = +b.dataset.v;
      if (E.x01Fresh(S.x01)) { var x = S.x01; S.x01 = E.newX01({ start: S.set.start, dblOut: S.set.dblOut, starter: x.starter, legs: x.legs, leg: x.leg, id: x.id }); }
      save(); renderSettings();
    });
    $('dblOut').addEventListener('change', function (e) { S.set.dblOut = S.x01.dblOut = e.target.checked; save(); });
    $('h18').addEventListener('change', function (e) {
      S.set.holes = e.target.checked ? 18 : 9;
      if (E.golfFresh(S.golf)) S.golf.holes = S.set.holes;
      save(); renderSettings();
    });
    $('roast').addEventListener('change', function (e) { S.set.roast = e.target.checked; save(); });
    $('setSub').addEventListener('click', function () {
      if (Pro.state.active) { Pro.manage().then(function (shown) { if (!shown) window.open(C.manageUrl, '_blank'); }); return; }
      $('setSheet').hidden = true; showPaywall();
    });
    $('setRestore').addEventListener('click', function () { doRestore('setNote'); });
    $('clearHist').addEventListener('click', function () {
      if (armed !== 'clear') { arm('clear'); renderSettings(); return; }
      armed = ''; S.hist = [];
      if (S.x01.winner >= 0) S.x01.noHist = true;
      if (S.golf.done) S.golf.noHist = true;
      save(); renderSettings();
    });

    /* paywall */
    $('plans').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      note('payNote', '');
      if (b.hasAttribute('data-retry')) { Pro.init(); return; }
      Pro.purchase(b.dataset.id).then(function (r) {
        if (r === 'purchased') unlocked();
        else if (r === 'unavailable') { note('payNote', 'The store could not be reached. Check your connection and try again.', 'err'); Pro.init(); }
      }, function (e) { note('payNote', e.message, 'err'); });
    });
    $('payRestore').addEventListener('click', function () { doRestore('payNote'); });

    document.querySelectorAll('.sheet').forEach(function (sh) {
      sh.addEventListener('click', function (e) { if (e.target === sh || e.target.closest('[data-close]')) closeSheet(sh.id); });
    });

    Pro.onChange(function () {
      if (!S) return;
      render();
      if (!$('paySheet').hidden) { if (Pro.state.active) $('paySheet').hidden = true; else renderPay(); }
      if (!$('setSheet').hidden) renderSettings();
    });
  }

  /* ---------- boot ---------- */
  wire();
  Store.load().then(function (saved) {
    var first = !saved;
    S = adopt(saved);
    var ready = Pro.init(); // reads the cached entitlement synchronously, then confirms with the store
    render();
    if (first) openSheet('setSheet');
    return ready;
  }).then(function () { render(); });
})();
