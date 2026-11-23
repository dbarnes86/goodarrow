/* UI. Holds the app state, wires the controls and renders. Game rules live in engine.js.
   Two screens: the lobby (players, games, results) and a game in play. Sheets slide over either. */
(function () {
  'use strict';
  var E = window.Engine, C = window.APP_CONFIG, Pro = window.Pro, Store = window.Store;
  var $ = function (id) { return document.getElementById(id); };
  var cap = window.Capacitor;
  var haptics = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.registerPlugin ? cap.registerPlugin('Haptics') : null;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;

  var COLORS = ['#2F7BFF', '#17D387', '#FFC53D', '#FF5C8A', '#9B7BFF', '#2FD6E3'];
  var MAXP = 6;
  var ICON = {
    x01: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    countup: '<path d="M5 19v-4M10 19v-8M15 19V8M20 19V4"/>',
    golf: '<path d="M8 21V3.5l10 4L8 11.5"/><path d="M4 21h10"/>',
    cricket: '<path d="M3.5 16.5l3.5-9"/><path d="M10 7.5l5 9M15 7.5l-5 9"/><circle cx="19.2" cy="12" r="2.8"/>',
    killer: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    atc: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2.2"/>',
    shanghai: '<path d="M5 19l7-4.5 7 4.5M5 13.5L12 9l7 4.5M5 8l7-4.5L19 8"/>',
    halve: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
    bobs: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.6"/><path d="M12 3v3.4M12 17.6V21"/>',
    baseball: '<path d="M12 3l9 9-9 9-9-9z"/><path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12z"/>',
    knockout: '<path d="M12 20.5S4.5 16 4.5 9.8A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.2c0 6.2-7.5 10.7-7.5 10.7z"/>',
    gotcha: '<path d="M13.5 2.5L5 14h6l-1.5 7.5L18 10h-6z"/>'
  };

  var S = null;            // persisted state
  var mod = 1;             // multiplier in hand on the full pad: 1 single, 2 double, 3 treble
  var edit = null;         // golf cell being corrected: {p, k}
  var hold = false;        // result held back while the ending plays
  var armed = '', armTimer = 0;
  var su = null;           // game being set up: {id, first}
  var plIndex = -1;        // player being edited
  var want = null;         // game the paywall was opened for
  var plan = null;         // plan selected on the paywall
  var padSig = '', padBtns = [], prevMain = {}, lastSlots = 0, toastTimer = 0;

  function fresh() {
    return { v: 2, players: ['Player 1', 'Player 2'], screen: 'lobby', match: null, hist: [],
      set: { roast: true, haptic: true, x01: { start: 301, dblOut: true }, golf: { holes: 18 } } };
  }
  function adopt(saved) {
    var f = fresh();
    if (!saved) return f;
    if (saved.v === 1 && saved.names) { f.players = saved.names.slice(0, MAXP); return f; }   // pre-release two-player builds
    if (saved.v !== 2 || !saved.players || !saved.players.length) return f;
    Object.keys(f).forEach(function (k) { if (saved[k] === undefined) saved[k] = f[k]; });
    Object.keys(f.set).forEach(function (k) { if (saved.set[k] === undefined) saved.set[k] = f.set[k]; });
    if (saved.match && !E.game(saved.match.game)) saved.match = null;
    return saved;
  }

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /** Fill {0}, {1}... in engine text with player names. */
  function tok(str, names) { return String(str || '').replace(/\{(\d+)\}/g, function (_, i) { return names[+i] || 'Player ' + (+i + 1); }); }
  function icon(id) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[id] || ICON.x01) + '</svg>'; }
  function cls(v) { return v < 0 ? (v < -1 ? ' neg neg2' : ' neg') : (v > 0 ? (v > 1 ? ' pos pos2' : ' pos') : ''); }
  function press(el, on) { el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function tap(style) { if (haptics && S.set.haptic) try { haptics.impact({ style: style || 'LIGHT' }).catch(function () {}); } catch (e) {} }
  function buzz(type) { if (haptics && S.set.haptic) try { haptics.notification({ type: type }).catch(function () {}); } catch (e) {} }
  function locked(g) { return g.pro && !Pro.state.active; }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = true; void t.offsetWidth; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function arm(what, redraw) {
    armed = what; clearTimeout(armTimer);
    armTimer = setTimeout(function () { armed = ''; redraw(); }, 3000);
    redraw();
  }
  /** A dartboard drawn from wedges; used for the brand mark and the paywall art. */
  function boardArt(colors) {
    var c = 50, R = 48, out = '', i;
    function ring(r1, r2, k, fill) {
      var a0 = (k * 18 - 99) * Math.PI / 180, a1 = (k * 18 - 81) * Math.PI / 180;
      function pt(r, a) { return (c + r * Math.cos(a)).toFixed(2) + ' ' + (c + r * Math.sin(a)).toFixed(2); }
      return '<path d="M' + pt(r1, a0) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + pt(r1, a1) + 'L' + pt(r2, a1) + 'A' + r2 + ' ' + r2 + ' 0 0 0 ' + pt(r2, a0) + 'Z" fill="' + fill + '"/>';
    }
    for (i = 0; i < 20; i++) {
      out += ring(R, R * .86, i, i % 2 ? colors[0] : colors[1]) + ring(R * .86, R * .56, i, i % 2 ? colors[2] : colors[3]) +
        ring(R * .56, R * .46, i, i % 2 ? colors[0] : colors[1]) + ring(R * .46, R * .2, i, i % 2 ? colors[2] : colors[3]);
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' + out + '<circle cx="50" cy="50" r="' + R * .2 + '" fill="' + colors[0] + '"/><circle cx="50" cy="50" r="' + R * .09 + '" fill="' + colors[1] + '"/></svg>';
  }

  /* ---------- results kept over time ---------- */
  function syncHist() {
    var M = S.match; if (!M) return;
    S.hist = S.hist.filter(function (h) { return h.id !== M.s.id; });
    if (M.s.done && !M.noHist) {
      var v = E.view(M.s);
      S.hist.push({ id: M.s.id, t: M.endT || (M.endT = Date.now()), game: M.game, title: v.title, names: M.names, winner: M.s.winner, mains: v.rows.map(function (r) { return r.main; }) });
    }
    S.hist.sort(function (a, b) { return b.t - a.t; });
    if (S.hist.length > 200) S.hist.length = 200;
  }
  function save() {
    syncHist();
    if (S.match && S.match.undo.length > 90) S.match.undo = S.match.undo.slice(-90);
    Store.save(S);
  }

  /* ---------- banners and confetti ---------- */
  /* Banners queue within one action (score, then hole change) but a newer action pre-empts older
     banners, so fast scoring never leaves the animations trailing behind the game. */
  var fxq = [], fxbusy = false, fxCur = null, fxTimer = 0, batch = 0, lastRoast = -1;
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
  function roast(p, names) {
    var pool = names.length > 1 ? roasts : roasts.filter(function (r) { return r.indexOf('{o}') < 0; }), i;
    do { i = Math.floor(Math.random() * pool.length); } while (pool.length > 1 && i === lastRoast);
    lastRoast = i;
    var others = names.filter(function (_, k) { return k !== p; });
    return pool[i].replace('{n}', names[p]).replace('{o}', others[Math.floor(Math.random() * others.length)] || '');
  }
  function fxClear() {
    batch++;
    fxq.forEach(function (q) { if (q.cb) q.cb(); });
    fxq = [];
    if (fxbusy) { clearTimeout(fxTimer); fxnext(); }
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
    else if (bad && it.m >= 2) buzz('WARNING');
    fxTimer = setTimeout(fxnext, d);
  }
  function party(ms) {
    var c = $('cv');
    if (!c.getContext || reduced) return;
    var x = c.getContext('2d'), W = c.width = window.innerWidth, H = c.height = window.innerHeight;
    var cols = ['#17D387', '#2F7BFF', '#FFC53D', '#F5F7FF', '#FF5C8A'];
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
  /** Turn the engine's events into banners. Games decided on totals get a drum roll before the reveal. */
  function showEvents(evs, M) {
    evs.forEach(function (e) {
      var names = M.names, sub = tok(e.s, names), dur = 0, cb = null;
      if (e.drum) {
        hold = true; cb = function () { hold = false; render(); };
        flash('And the winner is…', 'info', 2, '', 1600);
      }
      if (e.k === 'win') { M.note = sub; dur = 4600; } else if (e.tie) { M.note = sub; dur = 3600; }
      if (e.golf === 2 && S.set.roast) { sub = roast(e.p, names); dur = 3800; }
      flash(tok(e.t, names), e.k, e.m, sub, dur, cb);
    });
  }

  /* ---------- playing ---------- */
  function startGame(id, first) {
    var opts = { id: Date.now(), first: first || 0 };
    if (id === 'x01') { opts.start = S.set.x01.start; opts.dblOut = S.set.x01.dblOut; }
    if (id === 'golf') opts.holes = S.set.golf.holes;
    fxClear();
    S.match = { game: id, names: S.players.slice(), s: E.create(id, S.players.length, opts), undo: [], note: '' };
    S.screen = 'game'; mod = 1; edit = null; hold = false; padSig = ''; prevMain = {}; lastSlots = 0;
    save(); render(); window.scrollTo(0, 0);
  }
  function input(d) {
    var M = S.match; if (!M || M.s.done || hold) return;
    batch++;
    M.undo.push(JSON.stringify(M.s));
    var before = M.s.active, ev = E.dart(M.s, d); mod = 1;
    tap(M.s.active !== before ? 'MEDIUM' : 'LIGHT');
    showEvents(ev, M); save(); render();
  }
  function keepDart() {
    var M = S.match; if (!M) return;
    if (edit) { edit = null; render(); return; }
    if (M.s.done || M.s.pend == null) return;
    batch++; M.undo.push(JSON.stringify(M.s)); tap('MEDIUM');
    showEvents(E.keep(M.s), M); save(); render();
  }
  function undo() {
    var M = S.match; if (!M || !M.undo.length) return;
    fxClear(); M.s = JSON.parse(M.undo.pop()); M.endT = 0; mod = 1; edit = null; hold = false; tap();
    save(); render();
  }
  function again() {
    var M = S.match; if (!M) return;
    fxClear();
    S.match = { game: M.game, names: M.names, s: E.rematch(M.s, Date.now()), undo: [], note: '' };
    mod = 1; edit = null; hold = false; prevMain = {}; lastSlots = 0;
    save(); render(); window.scrollTo(0, 0);
  }
  function endGame() {
    fxClear(); S.match = null; S.screen = 'lobby'; edit = null; hold = false; armed = '';
    save(); render(); window.scrollTo(0, 0);
  }
  function go(screen) { S.screen = screen; armed = ''; save(); render(); window.scrollTo(0, 0); }

  /* ---------- lobby ---------- */
  function renderLobby() {
    var M = S.match, n = S.players.length, live = M && !M.s.done && !E.fresh(M.s);   // nothing to resume until a dart is thrown
    $('mark').innerHTML = boardArt(['#2F7BFF', '#17D387', '#F5F7FF', '#182241']);
    var r = $('resume');
    r.hidden = !live;
    if (live) {
      var v = E.view(M.s);
      r.innerHTML = '<div class="txt"><small>In progress</small><b>' + esc(v.title) + '</b><span>' + esc(v.info) + ' · ' + esc(M.names.join(', ')) + '</span></div>' +
        '<button type="button" class="end' + (armed === 'end' ? ' armed' : '') + '" data-a="end">' + (armed === 'end' ? 'Sure?' : 'End') + '</button>' +
        '<button type="button" class="go" data-a="resume">Resume</button>';
    }
    $('playerCount').textContent = n + ' of ' + MAXP;
    $('players').innerHTML = S.players.map(function (name, i) {
      return '<button type="button" class="chip" data-p="' + i + '" style="--pc:' + COLORS[i] + '"><span class="av">' + esc(name.charAt(0).toUpperCase()) + '</span><span>' + esc(name) + '</span></button>';
    }).join('') + (n < MAXP ? '<button type="button" class="chip add" data-p="add">+ Add player</button>' : '');
    $('gameCount').textContent = E.GAMES.length + ' games';
    $('games').innerHTML = E.GAMES.map(function (g) {
      var lk = locked(g), title = g.id === 'x01' ? '' + S.set.x01.start : g.name;
      return '<button type="button" class="gcard' + (lk ? ' locked' : '') + '" data-g="' + g.id + '"><span class="gicon">' + icon(g.id) + '</span><b>' + esc(title) + '</b><p>' + esc(g.blurb) + '</p>' +
        '<span class="meta"><span>' + (g.min === g.max ? g.min : g.min + '–' + g.max) + ' players</span>' + (lk ? '<span class="pill gold">Pro</span>' : (g.pro ? '' : '<span class="pill free">Free</span>')) + '</span></button>';
    }).join('');
    renderHist();
  }
  function renderHist() {
    var rows = S.hist, wins = {}, order = [], h = '<div class="head"><h2>Results</h2><span>' + (rows.length ? rows.length + ' played' : '') + '</span></div>';
    rows.forEach(function (r) { if (r.winner >= 0) { var w = r.names[r.winner]; if (!(w in wins)) { wins[w] = 0; order.push(w); } wins[w]++; } });
    order.sort(function (a, b) { return wins[b] - wins[a]; });
    if (!rows.length) h += '<p class="empty">Finished games are kept here, newest first.</p>';
    else h += '<div class="tally">' + order.slice(0, 6).map(function (w) { return '<span>' + esc(w) + '<b>' + wins[w] + '</b></span>'; }).join('') + '</div><ul class="results">' +
      rows.slice(0, 25).map(function (r) {
        var d = new Date(r.t), ds = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        var line = r.names.map(function (nm, i) { return nm + ' ' + r.mains[i]; }).join(' · ');
        return '<li><div class="g"><b>' + esc(r.title) + '</b><small>' + ds + '</small></div><div class="w"><b>' + (r.winner >= 0 ? esc(r.names[r.winner]) : 'Level') + '</b>' + esc(line) + '</div></li>';
      }).join('') + '</ul>';
    $('hist').innerHTML = h;
  }

  /* ---------- a game in play ---------- */
  function tween(el, from, to) {
    var t0 = performance.now(), dur = 380, sign = el.dataset.sign === '1';
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = Math.round(from + (to - from) * e);
      el.textContent = sign ? E.fmt(v) : '' + v;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function renderCards(M, v) {
    var s = M.s, n = s.n, box = $('cards');
    box.className = 'cards n' + n; box.style.setProperty('--cols', n === 1 ? 1 : (n === 2 || n === 4 ? 2 : 3));
    box.innerHTML = v.rows.map(function (r, p) {
      var lives = '';
      if (r.lives !== undefined && !r.out) { for (var k = 0; k < 3; k++) lives += '<i' + (k < r.lives ? '' : ' class="off"') + '></i>'; lives = '<div class="lives">' + lives + '</div>'; }
      return '<div class="pc' + (p === s.active && !s.done ? ' on' : '') + (r.out ? ' out' : '') + (s.done && s.winner === p ? ' on' : '') + '" style="--pc:' + COLORS[p] + '">' +
        '<div class="pn"><i></i><span>' + esc(M.names[p]) + '</span></div>' +
        '<div class="pm' + (r.sign !== undefined ? cls(r.sign) : '') + '" data-p="' + p + '"' + (r.sign !== undefined ? ' data-sign="1"' : '') + '>' + esc(r.main) + '</div>' +
        '<div class="ps' + (r.tag ? ' hot' : '') + '">' + esc(r.sub || '') + '</div>' + lives + (r.note !== undefined && n <= 2 ? '<div class="pnote">' + (esc(r.note) || '&nbsp;') + '</div>' : '') + '</div>';
    }).join('');
    // Count the number to its new value rather than swapping it.
    Array.prototype.forEach.call(box.querySelectorAll('.pm'), function (el) {
      var p = el.dataset.p, now = parseInt(el.textContent, 10), was = prevMain[p];
      if (!reduced && was !== undefined && !isNaN(now) && String(now) === el.textContent.replace('+', '') && was !== now) tween(el, was, now);
      prevMain[p] = isNaN(now) || String(now) !== el.textContent.replace('+', '') ? undefined : now;
    });
  }
  function renderGolf(M, v) {
    var s = M.s, b = v.board, live = !s.done, k, p, x, ed, t = '<table><tr><th>Hole</th>';
    for (k = 1; k <= b.holes; k++) t += '<th' + (k === b.hole && live ? ' class="hc"' : '') + '>' + k + '</th>';
    t += '</tr>';
    for (p = 0; p < s.n; p++) {
      var tot = E.sum(b.sc[p]);
      t += '<tr' + (p === s.active && live ? ' class="on"' : '') + '><td><span class="nm">' + esc(M.names[p]) + '</span><span class="tot' + cls(tot) + (b.lead.who === p && s.n > 1 ? ' top' : '') + '">' + E.fmt(tot) + '</span></td>';
      for (k = 1; k <= b.holes; k++) {
        x = b.sc[p][k - 1]; ed = edit && edit.p === p && edit.k === k;
        t += '<td' + (x != null ? ' data-p="' + p + '" data-k="' + k + '"' : '') + ' class="' + (ed ? 'edit' : (k === b.hole && p === s.active && live ? 'cur' : '') + cls(x)) + (x != null ? ' can' : '') + (k === b.hole && live ? ' hc' : '') + '">' + E.fmt(x) + '</td>';
      }
      t += '</tr>';
    }
    var card = $('board'); card.className = 'card' + (s.n >= 4 ? ' tight' : ''); card.innerHTML = t + '</table>';
    var hc = card.querySelector('th.hc');
    if (hc && !edit) card.scrollLeft = hc.offsetLeft - (card.clientWidth + 100) / 2;
    var ld = b.lead, lead = $('lead');
    lead.hidden = false;
    lead.innerHTML = (s.done && hold) ? 'Round complete<small>Totting up the card</small>' :
      esc(tok(v.lead, M.names)) + '<small>' + (ld.n ? 'After ' + ld.n + ' hole' + (ld.n > 1 ? 's' : '') + ' · ' + M.names.map(function (nm, i) { return esc(nm) + ' ' + E.fmt(ld.tot[i]); }).join(' · ') : 'Lowest total wins') + '</small>';
  }
  var MARK = ['', '<svg viewBox="0 0 24 24"><path d="M6 19L18 5"/></svg>', '<svg viewBox="0 0 24 24"><path d="M6 19L18 5M6 5l12 14"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M7.5 17L16.5 7M7.5 7l9 10"/><circle cx="12" cy="12" r="9.5"/></svg>'];
  function renderCricket(M, v) {
    var s = M.s, b = v.board, p, k, t = '<table><tr><th></th>';
    for (p = 0; p < s.n; p++) t += '<th' + (p === s.active && !s.done ? ' class="on"' : '') + '>' + esc(M.names[p]) + '<b>' + esc(v.rows[p].main) + '</b></th>';
    t += '</tr>';
    for (k = 0; k < b.nums.length; k++) {
      var shut = true; for (p = 0; p < s.n; p++) if (b.marks[p][k] < 3) shut = false;
      t += '<tr' + (shut ? ' class="shut"' : '') + '><td class="no">' + (b.nums[k] === 25 ? 'Bull' : b.nums[k]) + '</td>';
      for (p = 0; p < s.n; p++) t += '<td class="m' + b.marks[p][k] + (p === s.active && !s.done ? ' on' : '') + '">' + MARK[b.marks[p][k]] + '</td>';
      t += '</tr>';
    }
    var el = $('board'); el.className = 'crk'; el.innerHTML = t + '</table>';
  }
  function renderPad(M, v) {
    var s = M.s, pad = v.pad, el = $('pad'), h, i;
    var sig = pad.type === 'full' ? 'full:' + (pad.nums || 'all') : 'btn:' + pad.cols + ':' + (pad.golf ? 'g:' : '') + pad.btns.map(function (b) { return b.l + '|' + b.s + '|' + b.c; }).join(',');
    if (sig !== padSig) {
      padSig = sig;
      if (pad.type === 'full') {
        var nums = pad.nums || Array.apply(null, { length: 20 }).map(function (_, k) { return k + 1; });
        h = '<div class="mods"><button type="button" data-m="1">Single</button><button type="button" data-m="2">Double</button><button type="button" data-m="3">Treble</button></div>' +
          '<div class="nums' + (pad.nums ? ' c3' : '') + '" style="--rows:' + Math.ceil(nums.length / (pad.nums ? 3 : 5)) + '">' + nums.map(function (n) { return '<button type="button" class="key" data-n="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
          '<div class="extra"><button type="button" class="key" data-x="25">25</button><button type="button" class="key" data-x="bull">Bull</button><button type="button" class="key" data-x="miss">Miss</button><button type="button" class="key undo" data-a="undo">Undo</button></div>';
      } else {
        padBtns = pad.btns;
        h = '<div class="btns' + (pad.btns.length > 4 && !pad.golf ? ' small' : '') + '" style="--cols:' + pad.cols + ';--rows:' + Math.ceil(pad.btns.length / pad.cols) + '">' + pad.btns.map(function (b, k) {
          return '<button type="button" class="pb ' + b.c + '" data-b="' + k + '"><b>' + esc(b.l) + '</b><small>' + esc(tok(b.s, M.names)) + '</small></button>';
        }).join('') + '</div><div class="padrow' + (pad.golf ? '' : ' one') + '">' + (pad.golf ? '<button type="button" class="keep" data-a="keep">Keep</button>' : '') + '<button type="button" class="undo" data-a="undo">Undo</button></div>';
      }
      el.innerHTML = h;
    }
    if (pad.type === 'full') {
      var mods = el.querySelectorAll('[data-m]');
      for (i = 0; i < mods.length; i++) press(mods[i], mod === +mods[i].dataset.m);
      var ex = el.querySelectorAll('[data-x]');
      for (i = 0; i < ex.length; i++) ex[i].disabled = mod !== 1;
    } else { padBtns = pad.btns; }
    var kp = el.querySelector('[data-a="keep"]');
    if (kp) { kp.disabled = !edit && !pad.keep; kp.textContent = edit ? 'Cancel edit' : (pad.keep || 'Keep'); }
    el.querySelector('[data-a="undo"]').disabled = !M.undo.length;
  }
  function renderResult(M, v) {
    var s = M.s, el = $('result'), show = s.done && !hold;
    el.hidden = !show; if (!show) return;
    var tie = s.winner < 0, order = v.rows.map(function (_, i) { return i; });
    el.className = 'result' + (tie ? ' tie' : '');
    el.innerHTML = '<small>' + (tie ? 'Level' : 'Winner') + '</small><h2>' + (tie ? 'All square' : esc(M.names[s.winner])) + '</h2>' + (M.note ? '<p>' + esc(M.note) + '</p>' : '') +
      '<ol class="standing">' + order.map(function (p) { return '<li' + (p === s.winner ? ' class="w"' : '') + '><span>' + esc(M.names[p]) + '</span><b>' + esc(v.rows[p].main) + '</b></li>'; }).join('') + '</ol>' +
      '<div class="row"><button type="button" data-a="again">' + (M.game === 'x01' ? 'Next leg' : 'Play again') + '</button><button type="button" class="alt" data-a="lobby">All games</button></div>' +
      '<button type="button" class="ghost" data-a="undo">Undo last dart</button>';
  }
  function renderGame() {
    var M = S.match, s = M.s, v = E.view(s), names = M.names, board = v.board;
    $('gTitle').textContent = v.title; $('gInfo').textContent = v.info;
    $('lead').hidden = true;
    $('cards').hidden = !!board; $('board').hidden = !board;
    if (board && board.type === 'golf') renderGolf(M, v);
    else if (board) renderCricket(M, v);
    else renderCards(M, v);

    var playing = !s.done || !!edit;
    $('turn').hidden = !playing; $('pad').hidden = !playing;
    $('turn').className = 'turn' + (v.target ? '' : ' notarget');
    $('target').hidden = !v.target; $('targetV').textContent = v.target || '';
    var slots = '', k;
    for (k = 0; k < 3; k++) slots += '<div class="slot' + (v.slots[k] ? ' hit' : '') + (v.slots[k] && k === v.slots.length - 1 && v.slots.length > lastSlots ? ' new' : '') + '">' + esc(v.slots[k] || '') + '</div>';
    lastSlots = v.slots.length;
    $('slots').innerHTML = slots + (v.turnTotal == null ? '' : '<div class="total"><small>Turn</small><b>' + v.turnTotal + '</b></div>');
    $('hint').textContent = edit ? 'Editing ' + names[edit.p] + ', hole ' + edit.k + '. Tap the right score, or cancel.' : tok(v.hint, names);
    renderPad(M, v);
    renderResult(M, v);
  }

  function render() {
    var game = S.screen === 'game' && !!S.match;
    if ($('game').hidden === game) { $('lobby').hidden = game; $('game').hidden = !game; }
    if (game) renderGame(); else renderLobby();
  }

  /* ---------- sheets ---------- */
  function link(href, text) { return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + text + '</a>'; }
  function legalLinks() { return (C.privacyUrl ? link(C.privacyUrl, 'Privacy policy') : '') + (C.termsUrl ? link(C.termsUrl, 'Terms of use') : ''); }
  function note(id, text, kind) { var n = $(id); n.textContent = text || ''; n.className = 'note' + (kind ? ' ' + kind : ''); }
  function openSheet(id) { $(id).hidden = false; }
  function closeSheet(id) { $(id).hidden = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); armed = ''; render(); }

  function seg(id, items, cur) { $(id).innerHTML = items.map(function (it) { return '<button type="button" data-v="' + it[0] + '" aria-pressed="' + (it[0] === cur) + '">' + esc(it[1]) + '</button>'; }).join(''); }
  function renderSetup() {
    var g = E.game(su.id), M = S.match, h = '';
    $('suIcon').innerHTML = icon(g.id); $('suName').textContent = g.id === 'x01' ? S.set.x01.start : g.name; $('suBlurb').textContent = g.blurb;
    $('suHow').innerHTML = g.how.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    if (g.id === 'x01') h = '<h3>Options</h3><div class="seg" id="suStartSeg"></div><div class="field"><label for="suDbl">Double to finish<small>The last dart must be a double or the bull</small></label><input type="checkbox" class="tog" id="suDbl"' + (S.set.x01.dblOut ? ' checked' : '') + '></div>';
    if (g.id === 'golf') h = '<h3>Options</h3><div class="seg" id="suHolesSeg"></div>';
    $('suOpts').innerHTML = h; $('suOpts').hidden = !h;
    if (g.id === 'x01') seg('suStartSeg', [[301, '301'], [501, '501'], [701, '701']], S.set.x01.start);
    if (g.id === 'golf') seg('suHolesSeg', [[9, '9 holes'], [18, '18 holes']], S.set.golf.holes);
    seg('suFirst', S.players.map(function (nm, i) { return [i, nm]; }), su.first);
    note('suNote', M && !M.s.done && !E.fresh(M.s) ? 'Starting this ends the ' + E.view(M.s).title + ' game in progress.' : '');
  }
  function pickGame(id) {
    var g = E.game(id), n = S.players.length;
    if (locked(g)) { showPaywall(id); return; }
    if (n < g.min) { toast(g.name + ' needs at least ' + g.min + ' players. Add one above.'); return; }
    su = { id: id, first: 0 }; renderSetup(); openSheet('setupSheet');
  }
  function openPlayer(i) {
    plIndex = i; var isNew = i >= S.players.length;
    $('plTitle').textContent = isNew ? 'New player' : 'Player ' + (i + 1);
    $('plName').value = isNew || /^Player \d$/.test(S.players[i]) ? '' : S.players[i];
    $('plRemove').hidden = isNew || S.players.length <= 1;
    if (isNew) { S.players.push('Player ' + (i + 1)); save(); }
    openSheet('playerSheet');
    setTimeout(function () { try { $('plName').focus(); } catch (e) {} }, 60);
  }
  function renderRules() {
    var M = S.match, g = E.game(M.game);
    $('ruIcon').innerHTML = icon(g.id); $('ruName').textContent = E.view(M.s).title; $('ruBlurb').textContent = g.blurb;
    $('ruHow').innerHTML = g.how.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    var b = $('ruEnd'); b.textContent = armed === 'quit' ? 'Tap again to end the game' : 'End this game'; b.className = 'btn danger' + (armed === 'quit' ? ' armed' : '');
  }
  function renderSettings() {
    var on = Pro.state.active;
    $('roast').checked = S.set.roast; $('haptic').checked = S.set.haptic;
    $('subState').textContent = on ? 'Pro is active. Every game is unlocked.' : '301, 501 and Count-Up are free. Pro unlocks the other ten games.';
    $('setSub').textContent = on && Pro.native ? 'Manage purchase' : 'See Pro';
    $('setRestore').disabled = Pro.state.busy;
    var c = $('clearHist'); c.textContent = armed === 'clear' ? 'Tap again' : 'Clear'; c.className = 'btn' + (armed === 'clear' ? ' armed' : '');
    $('setLinks').innerHTML = legalLinks() + (C.supportEmail ? '<span>Support: ' + esc(C.supportEmail) + '</span>' : '');
    $('about').textContent = C.appName + ' ' + C.version;
  }
  function plans() { return Pro.state.packages.length ? Pro.state.packages : (Pro.native ? [] : Pro.demo); }
  function renderPay() {
    var list = plans(), demo = !Pro.state.packages.length && !Pro.native, g = want && E.game(want);
    $('payArt').innerHTML = boardArt(['#4A8DFF', '#FFC53D', '#F5F7FF', '#0E1D48']);
    $('payTitle').textContent = g ? 'Unlock ' + g.name : 'Every game. Every night.';
    $('payGames').innerHTML = E.GAMES.filter(function (x) { return x.pro; }).map(function (x) {
      return '<div class="pg' + (x.id === want ? ' want' : '') + '"><span class="gicon">' + icon(x.id) + '</span>' + esc(x.name) + '</div>';
    }).join('');
    if (!plan || !list.some(function (p) { return p.id === plan; })) {
      var yr = list.filter(function (p) { return p.type === 'ANNUAL'; })[0]; plan = (yr || list[0] || {}).id || null;
    }
    var mo = list.filter(function (p) { return p.type === 'MONTHLY'; })[0];
    $('plans').innerHTML = list.map(function (p) {
      var tag = '', sub = p.type === 'LIFETIME' ? 'Pay once, keep it for good' : (p.type === 'ANNUAL' ? 'Billed once a year' : 'Billed monthly');
      if (p.type === 'ANNUAL') {
        var save = mo && mo.amount && p.amount ? Math.round((1 - p.amount / (mo.amount * 12)) * 100) : 0;
        tag = '<i class="pill gold">' + (save > 0 ? 'Save ' + save + '%' : 'Best value') + '</i>';
      }
      return '<button type="button" class="plan" role="radio" aria-checked="' + (p.id === plan) + '" data-id="' + esc(p.id) + '"><span>' + esc(p.label) + '<small>' + sub + '</small></span><b>' + esc(p.price) + '<small>' + esc(p.term) + '</small></b>' + tag + '</button>';
    }).join('');
    var b = $('payBuy');
    b.disabled = Pro.state.busy || demo || (Pro.native && !list.length && false);
    b.textContent = Pro.state.busy ? 'Working…' : (!list.length ? 'Load prices again' : 'Continue');
    if (demo) note('payNote', 'Example prices. Purchases are made in the iOS app.');
    else if (!list.length) note('payNote', 'The store could not be reached. Check your connection and try again.', 'err');
    $('payRestore').disabled = Pro.state.busy;
    $('payLinks').innerHTML = legalLinks();
  }
  function unlocked() {
    $('paySheet').hidden = true; render();
    flash('Pro unlocked', 'good', 3, 'Every game is yours');
    if (want) { var id = want; want = null; pickGame(id); }
  }
  /** The app's own paywall, or RevenueCat's hosted one when config asks for it and it can be shown. */
  function showPaywall(gameId) {
    want = gameId || null;
    Pro.paywall().then(function (r) {
      if (r === 'purchased') unlocked();
      else if (r === 'fallback') { note('payNote', ''); renderPay(); openSheet('paySheet'); }
    });
  }
  function doRestore(noteId) {
    note(noteId, 'Checking…');
    Pro.restore().then(function (r) {
      if (r === 'restored') note(noteId, 'Pro restored.', 'ok');
      else if (r === 'none') note(noteId, 'No purchase found for this Apple Account.');
      else note(noteId, 'Purchases are made in the iOS app.');
    }, function (e) { note(noteId, e.message, 'err'); });
  }

  /* ---------- wiring ---------- */
  function on(id, type, fn) { $(id).addEventListener(type, fn); }
  function wire() {
    /* lobby */
    on('resume', 'click', function (e) {
      var a = e.target.dataset.a;
      if (a === 'resume') { var g = E.game(S.match.game); if (locked(g)) showPaywall(g.id); else go('game'); }
      if (a === 'end') { if (armed !== 'end') arm('end', render); else endGame(); }
    });
    on('players', 'click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      openPlayer(b.dataset.p === 'add' ? S.players.length : +b.dataset.p);
    });
    on('games', 'click', function (e) { var b = e.target.closest('button'); if (b) { tap(); pickGame(b.dataset.g); } });
    on('openSet', 'click', function () { note('setNote', ''); renderSettings(); openSheet('setSheet'); });

    /* player sheet */
    on('plName', 'input', function (e) { S.players[plIndex] = e.target.value.trim().slice(0, 14) || 'Player ' + (plIndex + 1); save(); });
    on('plName', 'keydown', function (e) { if (e.key === 'Enter') closeSheet('playerSheet'); });
    on('plRemove', 'click', function () { S.players.splice(plIndex, 1); save(); closeSheet('playerSheet'); });

    /* set-up sheet */
    on('setupSheet', 'click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      var box = b.parentNode.id, v = +b.dataset.v;
      if (box === 'suStartSeg') S.set.x01.start = v;
      if (box === 'suHolesSeg') S.set.golf.holes = v;
      if (box === 'suFirst') su.first = v;
      save(); renderSetup();
    });
    on('setupSheet', 'change', function (e) { if (e.target.id === 'suDbl') { S.set.x01.dblOut = e.target.checked; save(); } });
    on('suStart', 'click', function () { $('setupSheet').hidden = true; tap('MEDIUM'); startGame(su.id, su.first); });

    /* game */
    on('toLobby', 'click', function () { go('lobby'); });
    on('openRules', 'click', function () { armed = ''; renderRules(); openSheet('rulesSheet'); });
    on('ruEnd', 'click', function () { if (armed !== 'quit') arm('quit', renderRules); else { $('rulesSheet').hidden = true; endGame(); } });
    on('pad', 'click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      var d = b.dataset;
      if (d.a === 'undo') undo();
      else if (d.a === 'keep') keepDart();
      else if (d.m) { mod = (mod === +d.m ? 1 : +d.m); tap(); render(); }
      else if (d.n) input({ n: +d.n, m: mod });
      else if (d.x) input(d.x === 'miss' ? { n: 0, m: 1 } : { n: 25, m: d.x === 'bull' ? 2 : 1 });
      else if (d.b) {
        var dart = padBtns[+d.b].d, M = S.match;
        if (edit) {
          M.undo.push(JSON.stringify(M.s));
          if (!E.golfEdit(M.s, edit.p, edit.k, dart.g)) M.undo.pop();
          edit = null; tap(); save(); render();
        } else input(dart);
      }
    });
    on('board', 'click', function (e) {
      var c = e.target.closest('td[data-k]'); if (!c || hold) return;
      var p = +c.dataset.p, k = +c.dataset.k;
      edit = (edit && edit.p === p && edit.k === k) ? null : { p: p, k: k }; render();
    });
    on('result', 'click', function (e) {
      var a = e.target.dataset.a;
      if (a === 'again') again(); else if (a === 'lobby') go('lobby'); else if (a === 'undo') undo();
    });

    /* settings */
    on('roast', 'change', function (e) { S.set.roast = e.target.checked; save(); });
    on('haptic', 'change', function (e) { S.set.haptic = e.target.checked; save(); tap('MEDIUM'); });
    on('setSub', 'click', function () {
      if (Pro.state.active && Pro.native) { Pro.manage().then(function (shown) { if (!shown) window.open(C.manageUrl, '_blank'); }); return; }
      $('setSheet').hidden = true; showPaywall();
    });
    on('setRestore', 'click', function () { doRestore('setNote'); });
    on('clearHist', 'click', function () {
      if (armed !== 'clear') { arm('clear', renderSettings); return; }
      armed = ''; S.hist = []; if (S.match && S.match.s.done) S.match.noHist = true;
      save(); renderSettings();
    });

    /* paywall */
    on('plans', 'click', function (e) { var b = e.target.closest('button'); if (!b) return; plan = b.dataset.id; tap(); renderPay(); });
    on('payBuy', 'click', function () {
      note('payNote', '');
      if (!plans().length) { Pro.init().then(renderPay); return; }
      Pro.purchase(plan).then(function (r) {
        if (r === 'purchased') unlocked();
        else if (r === 'unavailable') { note('payNote', 'The store could not be reached. Check your connection and try again.', 'err'); Pro.init(); }
      }, function (e) { note('payNote', e.message, 'err'); });
    });
    on('payRestore', 'click', function () { doRestore('payNote'); });

    Array.prototype.forEach.call(document.querySelectorAll('.sheet'), function (sh) {
      sh.addEventListener('click', function (e) { if (e.target === sh || e.target.closest('[data-close]')) closeSheet(sh.id); });
    });

    Pro.onChange(function () {
      if (!S) return;
      render();
      if (!$('paySheet').hidden) { if (Pro.state.active && Pro.native) unlocked(); else renderPay(); }
      if (!$('setSheet').hidden) renderSettings();
    });
  }

  /* ---------- boot ---------- */
  wire();
  Store.load().then(function (saved) {
    var first = !saved;
    S = adopt(saved);
    var ready = Pro.init(); // reads the cached entitlement synchronously, then confirms with the store
    if (S.screen === 'game' && (!S.match || locked(E.game(S.match.game)))) S.screen = 'lobby';
    render();
    if (first) openPlayer(0);
    return ready;
  }).then(function () { render(); });
})();
