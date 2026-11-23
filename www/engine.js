/* Game rules. Pure functions over plain JSON state, no DOM, so they can be unit tested in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- checkout suggestions ---------- */
  var singles = [], doubles = [], trebles = [], i;
  for (i = 20; i >= 1; i--) {
    singles.push({ l: '' + i, v: i });
    doubles.push({ l: 'D' + i, v: 2 * i });
    trebles.push({ l: 'T' + i, v: 3 * i });
  }
  var bull = { l: 'Bull', v: 50 }, outer = { l: '25', v: 25 };
  var setups = singles.concat([outer], trebles, doubles, [bull]);
  // Preferred finishing doubles: the ones that halve cleanly first.
  var dPref = [20, 16, 18, 12, 8, 10, 4, 14, 6, 2].map(function (n) { return doubles[20 - n]; })
    .concat([bull], doubles.filter(function (d) { return (d.v / 2) % 2 === 1; }));
  var anyDesc = setups.slice().sort(function (a, b) { return b.v - a.v; });
  var firsts = trebles.slice(0, 6).concat([bull], trebles.slice(6, 11), singles);

  function one(v) { for (var k = 0; k < setups.length; k++) if (setups[k].v === v) return setups[k]; return null; }
  function fin1(rem, dbl) { var f = dbl ? dPref : setups; for (var k = 0; k < f.length; k++) if (f[k].v === rem) return [f[k]]; return null; }
  function fin2(rem, dbl) { var f = dbl ? dPref : anyDesc; for (var k = 0; k < f.length; k++) { var a = one(rem - f[k].v); if (a) return [a, f[k]]; } return null; }
  function fin3(rem, dbl) {
    for (var k = 0; k < firsts.length; k++) {
      var r = rem - firsts[k].v; if (r < 1) continue;
      var t = fin2(r, dbl); if (t) return [firsts[k]].concat(t);
    }
    return null;
  }
  /** Darts to finish `rem` with `n` darts in hand, as labels like ["T20","T19","D12"], or null. */
  function checkout(rem, n, dbl) {
    if (rem > 170 || rem < 1) return null;
    var r = fin1(rem, dbl) || (n > 1 && fin2(rem, dbl)) || (n > 2 && fin3(rem, dbl)) || null;
    return r ? r.map(function (d) { return d.l; }) : null;
  }

  /* ---------- X01 (301, 501) ---------- */
  function newX01(o) {
    o = o || {};
    var start = o.start || 301, s = o.starter || 0;
    return {
      start: start, score: [start, start], legs: o.legs ? o.legs.slice() : [0, 0],
      darts: [0, 0], pts: [0, 0], last: ['', ''], active: s, starter: s, turn: [], turnStart: start,
      dblOut: o.dblOut !== false, winner: -1, leg: o.leg || 1, id: o.id || 0, bust: -1
    };
  }
  function dartLabel(d) {
    if (d.v === 0) return 'Miss';
    if (d.n === 25) return d.m === 2 ? 'Bull' : '25';
    return (d.m === 2 ? 'D' : d.m === 3 ? 'T' : '') + d.n;
  }
  function turnText(s) { return s.turn.map(dartLabel).join(' · '); }
  function endTurn(s, p, scored, bust) {
    s.last[p] = turnText(s) + (bust ? ' — bust' : ' = ' + scored);
    s.turn = []; s.active = 1 - p; s.turnStart = s.score[s.active];
  }
  /** Throw one dart: n is the number (0 miss, 25 bull ring), m the multiplier. Returns an event. */
  function x01Throw(s, n, m) {
    if (s.winner >= 0) return null;
    if (n === 25 && m === 3) return null;
    var p = s.active, v = n * m;
    s.turn.push({ n: n, m: m, v: v }); s.darts[p]++; s.bust = -1;
    var rem = s.score[p] - v;
    var bust = rem < 0 || (s.dblOut && (rem === 1 || (rem === 0 && m !== 2)));
    if (bust) {
      s.pts[p] -= (s.turnStart - s.score[p]); s.score[p] = s.turnStart; s.bust = p;
      endTurn(s, p, 0, true);
      return { type: 'bust', player: p };
    }
    s.score[p] = rem; s.pts[p] += v;
    if (rem === 0) {
      s.legs[p]++; s.winner = p; s.last[p] = turnText(s) + ' = ' + s.turnStart;
      return { type: 'win', player: p, darts: s.darts[p] };
    }
    if (s.turn.length === 3) {
      var scored = s.turnStart - rem; endTurn(s, p, scored, false);
      return { type: 'turn', player: p, scored: scored };
    }
    return { type: 'dart', player: p };
  }
  function x01Next(s, o) {
    o = o || {};
    return newX01({ start: o.start || s.start, dblOut: o.dblOut === undefined ? s.dblOut : o.dblOut,
      starter: 1 - s.starter, legs: s.legs, leg: s.leg + 1, id: o.id || 0 });
  }
  function x01Avg(s, p) { return s.darts[p] ? s.pts[p] / s.darts[p] * 3 : null; }
  function x01Fresh(s) { return s.winner < 0 && !s.turn.length && !s.darts[0] && !s.darts[1]; }

  /* ---------- Golf ----------
     Hole N is the number N. Up to three darts a hole and the last dart thrown is the one that counts.
     Scores are relative to par (0). Lowest total wins and has the honour on the next hole. */
  function sum(a) { var t = 0; for (var k = 0; k < a.length; k++) t += a[k]; return t; }
  function newGolf(o) {
    o = o || {};
    var s = o.starter || 0;
    return { holes: o.holes || 18, starter: s, first: s, sc: [[], []], active: s, hole: 1, dart: 0, pend: null, done: false, id: o.id || 0 };
  }
  function golfFresh(g) { return g.dart === 0 && !g.sc[0].length && !g.sc[1].length; }
  /** Standing after the holes both players have completed. who is -1 when level. */
  function golfLead(g) {
    var n = Math.min(g.sc[0].length, g.sc[1].length), a = sum(g.sc[0].slice(0, n)), b = sum(g.sc[1].slice(0, n));
    return { n: n, a: a, b: b, who: a < b ? 0 : (b < a ? 1 : -1), margin: Math.abs(a - b) };
  }
  function golfKeep(g) {
    if (g.done || g.pend == null) return [];
    var sc = g.pend, who = g.active, ev = [{ type: 'score', player: who, score: sc }];
    g.sc[who].push(sc); g.dart = 0; g.pend = null;
    if (who === g.first) { g.active = 1 - who; return ev; }
    var a = sum(g.sc[0]), b = sum(g.sc[1]), L = a < b ? 0 : (b < a ? 1 : -1);
    if (g.hole === g.holes) {
      g.done = true;
      ev.push({ type: 'done', winner: L, a: a, b: b, margin: Math.abs(a - b) });
      return ev;
    }
    var n = g.sc[0].length, pa = a - g.sc[0][n - 1], pb = b - g.sc[1][n - 1], P = pa < pb ? 0 : (pb < pa ? 1 : -1);
    if (L >= 0) g.first = L; // level: the honour stays where it was
    g.hole++; g.active = g.first;
    ev.push({ type: 'hole', hole: g.hole, lead: L, prevLead: P, margin: Math.abs(a - b), first: g.first });
    return ev;
  }
  /** Record a dart. The third dart is kept automatically. */
  function golfDart(g, score) {
    if (g.done) return [];
    g.dart++; g.pend = score;
    return g.dart >= 3 ? golfKeep(g) : [{ type: 'pending', player: g.active, score: score }];
  }
  /** Correct an already-entered hole (k is 1-based). Does not reorder the hole in play. */
  function golfEdit(g, p, k, score) {
    if (k < 1 || k > g.sc[p].length) return false;
    g.sc[p][k - 1] = score; return true;
  }
  function fmt(n) { return n == null ? '' : (n > 0 ? '+' + n : '' + n); }

  return {
    checkout: checkout,
    newX01: newX01, x01Throw: x01Throw, x01Next: x01Next, x01Avg: x01Avg, x01Fresh: x01Fresh, dartLabel: dartLabel,
    newGolf: newGolf, golfDart: golfDart, golfKeep: golfKeep, golfEdit: golfEdit, golfLead: golfLead, golfFresh: golfFresh,
    sum: sum, fmt: fmt
  };
});
