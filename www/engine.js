/* Game rules for every game. Pure functions over plain JSON state, no DOM, so they run in Node for tests.

   Engine.create(gameId, playerCount, opts) -> state
   Engine.dart(state, d)                    -> events   d is {n, m} (number, multiplier) or {g: score} for golf
   Engine.keep(state)                       -> events   golf only: keep the last dart thrown
   Engine.view(state)                       -> what to draw: rows, hint, the input pad
   Engine.rematch(state, id)                -> a fresh state for the same game with the throw rotated

   Events are banners for the UI: {k: good|bad|info|win, m: 1-4 (size), t: title, s: subtitle}.
   Text uses {0}, {1}... for player names, which the UI fills in. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- helpers ---------- */
  function fill(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(typeof v === 'function' ? v(i) : v); return a; }
  function sum(a) { var t = 0; for (var k = 0; k < a.length; k++) t += a[k]; return t; }
  function fmt(n) { return n == null ? '' : (n > 0 ? '+' + n : '' + n); }
  function P(p) { return '{' + p + '}'; }
  function alive(s, p) { return !s.out || !s.out[p]; }
  function aliveCount(s) { var c = 0; for (var p = 0; p < s.n; p++) if (alive(s, p)) c++; return c; }
  function lastAlive(s) { for (var p = 0; p < s.n; p++) if (alive(s, p)) return p; return -1; }
  /** Index of the single best value, or -1 when the best is shared. */
  function best(vals, lower, only) {
    var b = null, who = -1, tie = false;
    for (var p = 0; p < vals.length; p++) {
      if (only && !only(p)) continue;
      if (b === null || (lower ? vals[p] < b : vals[p] > b)) { b = vals[p]; who = p; tie = false; }
      else if (vals[p] === b) tie = true;
    }
    return tie ? -1 : who;
  }
  function dartLabel(d) {
    if (d.g !== undefined) return fmt(d.g);
    if (!d.n) return 'Miss';
    if (d.n === 25) return d.m === 2 ? 'Bull' : '25';
    return (d.m === 2 ? 'D' : d.m === 3 ? 'T' : '') + d.n;
  }
  function turnSum(s) { var t = 0; for (var k = 0; k < s.turn.length; k++) t += (s.turn[k].n || 0) * (s.turn[k].m || 0); return t; }
  /** Pass the throw to the next player still in. Returns true when that starts a new round. */
  function advance(s) {
    var wrapped = false, guard = 0;
    do {
      s.pos++; if (s.pos >= s.order.length) { s.pos = 0; wrapped = true; }
    } while (!alive(s, s.order[s.pos]) && ++guard <= s.n);
    s.active = s.order[s.pos]; s.turn = [];
    if (wrapped) s.round++;
    return wrapped;
  }
  function finish(s, winner, ev, sub, drum) {
    s.done = true; s.winner = winner;
    if (winner >= 0) ev.push({ k: 'win', m: 4, t: P(winner) + ' wins', s: sub || '', p: winner, drum: !!drum });
    else ev.push({ k: 'info', m: 2, t: 'All square', s: sub || 'Nothing between you', tie: true, drum: !!drum });
    return ev;
  }
  var BTN = {
    miss: function () { return { l: 'Miss', s: '', d: { n: 0, m: 1 }, c: 'miss' }; },
    hit: function (label, sub, n, m, c) { return { l: label, s: sub || '', d: { n: n, m: m }, c: c || 'hit' }; }
  };
  function sdt(n) { return [BTN.miss(), BTN.hit('Single', '' + n, n, 1, 's1'), BTN.hit('Double', 'D' + n, n, 2, 's2'), BTN.hit('Treble', 'T' + n, n, 3, 's3')]; }

  /* ---------- checkout suggestions ---------- */
  var singles = [], doubles = [], trebles = [], i;
  for (i = 20; i >= 1; i--) {
    singles.push({ l: '' + i, v: i }); doubles.push({ l: 'D' + i, v: 2 * i }); trebles.push({ l: 'T' + i, v: 3 * i });
  }
  var bull = { l: 'Bull', v: 50 }, outer = { l: '25', v: 25 };
  var setups = singles.concat([outer], trebles, doubles, [bull]);
  var dPref = [20, 16, 18, 12, 8, 10, 4, 14, 6, 2].map(function (n) { return doubles[20 - n]; })
    .concat([bull], doubles.filter(function (d) { return (d.v / 2) % 2 === 1; }));
  var anyDesc = setups.slice().sort(function (a, b) { return b.v - a.v; });
  var firsts = trebles.slice(0, 6).concat([bull], trebles.slice(6, 11), singles);
  function one(v) { for (var k = 0; k < setups.length; k++) if (setups[k].v === v) return setups[k]; return null; }
  function fin1(rem, dbl) { var f = dbl ? dPref : setups; for (var k = 0; k < f.length; k++) if (f[k].v === rem) return [f[k]]; return null; }
  function fin2(rem, dbl) { var f = dbl ? dPref : anyDesc; for (var k = 0; k < f.length; k++) { var a = one(rem - f[k].v); if (a) return [a, f[k]]; } return null; }
  function fin3(rem, dbl) {
    for (var k = 0; k < firsts.length; k++) { var r = rem - firsts[k].v; if (r < 1) continue; var t = fin2(r, dbl); if (t) return [firsts[k]].concat(t); }
    return null;
  }
  function checkout(rem, n, dbl) {
    if (rem > 170 || rem < 1) return null;
    var r = fin1(rem, dbl) || (n > 1 && fin2(rem, dbl)) || (n > 2 && fin3(rem, dbl)) || null;
    return r ? r.map(function (d) { return d.l; }) : null;
  }

  var FULL = { type: 'full', nums: null };
  var TOTALS = { x01: 1, countup: 1, gotcha: 1, knockout: 1 };
  var G = {};

  /* ---------- X01: race down from 301, 501 or 701 ---------- */
  G.x01 = {
    init: function (s) {
      s.start = s.opts.start || 301; s.dblOut = s.opts.dblOut !== false;
      s.score = fill(s.n, s.start); s.legs = s.opts.legs ? s.opts.legs.slice() : fill(s.n, 0);
      s.darts = fill(s.n, 0); s.pts = fill(s.n, 0); s.last = fill(s.n, '');
      s.turnStart = s.start; s.leg = s.opts.leg || 1; s.bust = -1;
    },
    dart: function (s, d) {
      if (d.n === 25 && d.m === 3) return null;
      var p = s.active, v = d.n * d.m, ev = [];
      s.turn.push(d); s.darts[p]++; s.bust = -1;
      var rem = s.score[p] - v, bust = rem < 0 || (s.dblOut && (rem === 1 || (rem === 0 && d.m !== 2)));
      var text = s.turn.map(dartLabel).join(' · ');
      if (bust) {
        s.pts[p] -= (s.turnStart - s.score[p]); s.score[p] = s.turnStart; s.bust = p; s.last[p] = text + ' — bust';
        ev.push({ k: 'bad', m: 2, t: 'Bust', s: P(p) + ' stays on ' + s.score[p] });
        advance(s); s.turnStart = s.score[s.active]; return ev;
      }
      s.score[p] = rem; s.pts[p] += v;
      if (rem === 0) { s.legs[p]++; s.last[p] = text + ' = ' + s.turnStart; return finish(s, p, ev, 'Leg out in ' + s.darts[p] + ' darts'); }
      if (s.turn.length === 3) {
        var scored = s.turnStart - rem; s.last[p] = text + ' = ' + scored;
        if (scored >= 100) ev.push({ k: 'good', m: scored >= 180 ? 4 : (scored >= 140 ? 3 : 2), t: scored + '!', s: P(p) });
        advance(s); s.turnStart = s.score[s.active];
      }
      return ev;
    },
    view: function (s) {
      var p = s.active, left = 3 - s.turn.length, c = checkout(s.score[p], left, s.dblOut), hint;
      var out = c ? P(p) + ' can go out: ' + c.join(' · ') : '';
      if (s.bust >= 0 && !s.turn.length) hint = 'Bust. ' + P(s.bust) + ' stays on ' + s.score[s.bust] + '. ' + out;
      else if (c) hint = out;
      else if (s.score[p] <= 170) hint = 'No finish with ' + left + ' dart' + (left > 1 ? 's' : '') + ' left.';
      else hint = P(p) + ' to throw. ' + (s.score[p] - 170) + ' more to reach a finish.';
      return {
        title: '' + s.start, info: 'Leg ' + s.leg, hint: hint, pad: FULL,
        rows: fill(s.n, function (q) {
          var avg = s.darts[q] ? (s.pts[q] / s.darts[q] * 3).toFixed(1) : '–';
          return { main: '' + s.score[q], sub: 'Legs ' + s.legs[q] + ' · Avg ' + avg, note: s.last[q] };
        })
      };
    }
  };

  /* ---------- Count-Up: highest total after eight rounds ---------- */
  G.countup = {
    init: function (s) { s.rounds = 8; s.total = fill(s.n, 0); },
    dart: function (s, d) {
      var p = s.active, ev = []; s.turn.push(d); s.total[p] += d.n * d.m;
      if (s.turn.length === 3) {
        var t = turnSum(s); if (t >= 100) ev.push({ k: 'good', m: t >= 180 ? 4 : (t >= 140 ? 3 : 2), t: t + '!', s: P(p) });
        if (advance(s) && s.round > s.rounds) { s.round = s.rounds; return finish(s, best(s.total), ev, 'Highest total after ' + s.rounds + ' rounds', true); }
      }
      return ev;
    },
    view: function (s) {
      return { title: 'Count-Up', info: 'Round ' + s.round + ' of ' + s.rounds, pad: FULL,
        hint: P(s.active) + ' to throw. Score as many as you can.',
        rows: fill(s.n, function (q) { return { main: '' + s.total[q], sub: 'Total' }; }) };
    }
  };

  /* ---------- Gotcha: race up to exactly 301; land on a rival's total and they go back to zero ---------- */
  G.gotcha = {
    init: function (s) { s.target = s.opts.target || 301; s.total = fill(s.n, 0); s.turnStart = 0; },
    dart: function (s, d) {
      var p = s.active, ev = [], t = s.total[p] + d.n * d.m; s.turn.push(d);
      if (t > s.target) {
        s.total[p] = s.turnStart; ev.push({ k: 'bad', m: 2, t: 'Bust', s: P(p) + ' stays on ' + s.total[p] });
        advance(s); s.turnStart = s.total[s.active]; return ev;
      }
      s.total[p] = t;
      if (t === s.target) return finish(s, p, ev, 'Exactly ' + s.target);
      for (var q = 0; q < s.n; q++) if (q !== p && t > 0 && s.total[q] === t) {
        s.total[q] = 0; ev.push({ k: 'good', m: 3, t: 'Gotcha!', s: P(q) + ' goes back to zero' });
      }
      if (s.turn.length === 3) { advance(s); s.turnStart = s.total[s.active]; }
      return ev;
    },
    view: function (s) {
      var p = s.active, need = s.target - s.total[p], near = [];
      for (var q = 0; q < s.n; q++) { var gap = s.total[q] - s.total[p]; if (q !== p && gap > 0 && gap <= 60) near.push(gap + ' catches ' + P(q)); }
      return { title: 'Gotcha', info: 'First to exactly ' + s.target, pad: FULL,
        hint: P(p) + ' needs ' + need + '.' + (near.length ? ' ' + near.join(', ') + '.' : ''),
        rows: fill(s.n, function (q) { return { main: '' + s.total[q], sub: (s.target - s.total[q]) + ' to go' }; }) };
    }
  };

  /* ---------- Knockout: beat the score before you or lose a life ---------- */
  G.knockout = {
    init: function (s) { s.lives = fill(s.n, 3); s.out = fill(s.n, false); s.toBeat = null; s.setBy = -1; },
    dart: function (s, d) {
      var p = s.active, ev = []; s.turn.push(d);
      if (s.turn.length < 3) return ev;
      var t = turnSum(s);
      if (s.toBeat !== null && t <= s.toBeat) {
        s.lives[p]--;
        if (s.lives[p] <= 0) { s.out[p] = true; ev.push({ k: 'bad', m: 3, t: 'Knocked out', s: P(p) + ' needed more than ' + s.toBeat }); }
        else ev.push({ k: 'bad', m: 2, t: 'Life lost', s: P(p) + ' needed more than ' + s.toBeat });
      }
      s.toBeat = t; s.setBy = p;
      if (aliveCount(s) === 1) return finish(s, lastAlive(s), ev, 'Last one standing');
      advance(s); return ev;
    },
    view: function (s) {
      var have = turnSum(s);
      return { title: 'Knockout', info: 'Round ' + s.round, pad: FULL,
        hint: s.toBeat === null ? P(s.active) + ' sets the first score to beat.'
          : P(s.active) + ' must beat ' + s.toBeat + (s.turn.length ? ' and has ' + have + '.' : ', set by ' + P(s.setBy) + '.'),
        rows: fill(s.n, function (q) { return { main: s.out[q] ? 'Out' : '' + s.lives[q], sub: s.out[q] ? '' : (s.lives[q] === 1 ? 'life' : 'lives'), lives: s.lives[q], out: s.out[q] }; }) };
    }
  };

  /* ---------- Cricket: close 20 down to 15 and the bull, then score on them ---------- */
  var CR = [20, 19, 18, 17, 16, 15, 25];
  G.cricket = {
    init: function (s) { s.marks = fill(s.n, function () { return fill(7, 0); }); s.pts = fill(s.n, 0); },
    dart: function (s, d) {
      var p = s.active, ev = [], ix = CR.indexOf(d.n); s.turn.push(d);
      if (ix >= 0 && d.n > 0) {
        var hits = d.n === 25 ? (d.m === 2 ? 2 : 1) : d.m, k, q, open;
        for (k = 0; k < hits; k++) {
          if (s.marks[p][ix] < 3) {
            s.marks[p][ix]++;
            if (s.marks[p][ix] === 3) ev.push({ k: 'good', m: 1, t: 'Closed ' + (d.n === 25 ? 'bull' : d.n), s: P(p) });
          } else {
            open = false; for (q = 0; q < s.n; q++) if (q !== p && s.marks[q][ix] < 3) open = true;
            if (open) s.pts[p] += d.n;
          }
        }
        var all = true; for (k = 0; k < 7; k++) if (s.marks[p][k] < 3) all = false;
        var top = true; for (q = 0; q < s.n; q++) if (q !== p && s.pts[q] > s.pts[p]) top = false;
        if (all && top) return finish(s, p, ev, 'Everything closed on ' + s.pts[p] + ' points');
        // Nothing left to score on once everyone has closed everything: the points decide it.
        var shut = true; for (q = 0; q < s.n; q++) for (k = 0; k < 7; k++) if (s.marks[q][k] < 3) shut = false;
        if (shut) return finish(s, best(s.pts), ev, 'Every number closed');
      }
      if (s.turn.length === 3) advance(s);
      return ev;
    },
    view: function (s) {
      var p = s.active, need = [];
      for (var k = 0; k < 7; k++) if (s.marks[p][k] < 3) need.push(CR[k] === 25 ? 'Bull' : CR[k]);
      return { title: 'Cricket', info: 'Round ' + s.round, pad: { type: 'full', nums: [20, 19, 18, 17, 16, 15] },
        hint: need.length ? P(p) + ' still needs ' + need.join(', ') + '.' : P(p) + ' has closed everything and needs the points lead.',
        board: { type: 'cricket', nums: CR, marks: s.marks },
        rows: fill(s.n, function (q) { return { main: '' + s.pts[q], sub: 'Points' }; }) };
    }
  };

  /* ---------- Around the Clock: 1 to 20 in order, then the bull ---------- */
  G.atc = {
    init: function (s) { s.at = fill(s.n, 1); },
    dart: function (s, d) {
      var p = s.active, ev = [], t = s.at[p]; s.turn.push(d);
      if (t <= 20 ? d.n === t : d.n === 25) {
        s.at[p]++;
        if (s.at[p] > 21) return finish(s, p, ev, 'Round the board and out on the bull');
        if (s.at[p] === 21) ev.push({ k: 'good', m: 2, t: 'Bull to finish', s: P(p) });
      }
      if (s.turn.length === 3) advance(s);
      return ev;
    },
    view: function (s) {
      var t = s.at[s.active], name = t <= 20 ? '' + t : 'Bull';
      return { title: 'Around the Clock', info: 'Round ' + s.round, target: name,
        hint: P(s.active) + ' is aiming at ' + (t <= 20 ? 'the ' + t : 'the bull') + '. Any part of it counts.',
        pad: { type: 'btn', cols: 2, btns: [BTN.miss(), t <= 20 ? BTN.hit('Hit', name, t, 1) : BTN.hit('Hit', 'Bull', 25, 2)] },
        rows: fill(s.n, function (q) { return { main: s.at[q] <= 20 ? '' + s.at[q] : 'Bull', sub: (s.at[q] - 1) + ' of 21 done' }; }) };
    }
  };

  /* ---------- Shanghai: seven rounds on the numbers 1 to 7; single, double and treble in one turn wins outright ---------- */
  G.shanghai = {
    init: function (s) { s.rounds = 7; s.score = fill(s.n, 0); s.kinds = [0, 0, 0, 0]; },
    dart: function (s, d) {
      var p = s.active, ev = []; s.turn.push(d);
      if (d.n === s.round && d.n > 0) {
        s.score[p] += d.n * d.m; s.kinds[d.m] = 1;
        if (s.kinds[1] && s.kinds[2] && s.kinds[3]) { ev.push({ k: 'good', m: 4, t: 'Shanghai!', s: 'Single, double and treble ' + s.round }); return finish(s, p, ev, 'Shanghai on the ' + s.round); }
      }
      if (s.turn.length === 3) {
        s.kinds = [0, 0, 0, 0];
        if (advance(s) && s.round > s.rounds) { s.round = s.rounds; return finish(s, best(s.score), ev, 'Highest score after ' + s.rounds + ' rounds', true); }
      }
      return ev;
    },
    view: function (s) {
      return { title: 'Shanghai', info: 'Round ' + s.round + ' of ' + s.rounds, target: '' + s.round,
        hint: P(s.active) + ' is on the ' + s.round + '. Single, double and treble in one turn wins outright.',
        pad: { type: 'btn', cols: 4, btns: sdt(s.round) },
        rows: fill(s.n, function (q) { return { main: '' + s.score[q], sub: 'Points' }; }) };
    }
  };

  /* ---------- Halve-It: hit the target or lose half your score ---------- */
  var HV = [{ l: '20', n: 20 }, { l: '16', n: 16 }, { l: 'Double 7', n: 7, m: 2 }, { l: '14', n: 14 }, { l: '18', n: 18 }, { l: 'Treble 10', n: 10, m: 3 }, { l: 'Bull', n: 25 }];
  G.halve = {
    init: function (s) { s.rounds = HV.length; s.score = fill(s.n, 40); s.hit = 0; },
    dart: function (s, d) {
      var p = s.active, ev = [], t = HV[s.round - 1]; s.turn.push(d);
      if (d.n === t.n && (!t.m || d.m === t.m)) { s.score[p] += d.n * d.m; s.hit++; }
      if (s.turn.length === 3) {
        if (!s.hit) { s.score[p] = Math.ceil(s.score[p] / 2); ev.push({ k: 'bad', m: 2, t: 'Halved', s: P(p) + ' drops to ' + s.score[p] }); }
        s.hit = 0;
        if (advance(s) && s.round > s.rounds) { s.round = s.rounds; return finish(s, best(s.score), ev, 'Highest score after ' + s.rounds + ' rounds', true); }
      }
      return ev;
    },
    view: function (s) {
      var t = HV[s.round - 1], btns;
      if (t.n === 25) btns = [BTN.miss(), BTN.hit('Outer', '25', 25, 1, 's1'), BTN.hit('Bull', '50', 25, 2, 's3')];
      else if (t.m) btns = [BTN.miss(), BTN.hit('Hit', (t.m === 2 ? 'D' : 'T') + t.n, t.n, t.m)];
      else btns = sdt(t.n);
      return { title: 'Halve-It', info: 'Round ' + s.round + ' of ' + s.rounds, target: t.l,
        hint: P(s.active) + ' needs the ' + t.l.toLowerCase() + '. Miss with all three and the score is halved.',
        pad: { type: 'btn', cols: btns.length, btns: btns },
        rows: fill(s.n, function (q) { return { main: '' + s.score[q], sub: 'Points' }; }) };
    }
  };

  /* ---------- Bob's 27: every double in turn; a blank round costs you that double ---------- */
  G.bobs = {
    init: function (s) { s.rounds = 21; s.score = fill(s.n, 27); s.out = fill(s.n, false); s.hit = 0; },
    dart: function (s, d) {
      var p = s.active, ev = [], r = s.round, val = r <= 20 ? 2 * r : 50; s.turn.push(d);
      if (d.m === 2 && (r <= 20 ? d.n === r : d.n === 25)) { s.score[p] += val; s.hit++; }
      if (s.turn.length === 3) {
        if (!s.hit) {
          s.score[p] -= val;
          if (s.score[p] < 1) { s.out[p] = true; ev.push({ k: 'bad', m: 3, t: 'Bust', s: P(p) + ' is out of the game' }); }
        }
        s.hit = 0;
        if (!aliveCount(s)) return finish(s, best(s.score), ev, 'Nobody made it round');
        if (advance(s) && s.round > s.rounds) { s.round = s.rounds; return finish(s, best(s.score, false, function (q) { return alive(s, q); }), ev, 'Highest score on the doubles', true); }
      }
      return ev;
    },
    view: function (s) {
      var r = s.round, name = r <= 20 ? 'D' + r : 'Bull';
      return { title: "Bob's 27", info: 'Round ' + r + ' of ' + s.rounds, target: name,
        hint: P(s.active) + ' needs ' + (r <= 20 ? 'double ' + r : 'the bull') + '. A blank round costs ' + (r <= 20 ? 2 * r : 50) + '.',
        pad: { type: 'btn', cols: 2, btns: [BTN.miss(), r <= 20 ? BTN.hit('Hit', name, r, 2) : BTN.hit('Hit', 'Bull', 25, 2)] },
        rows: fill(s.n, function (q) { return { main: s.out[q] ? 'Out' : '' + s.score[q], sub: s.out[q] ? '' : 'Points', out: s.out[q] }; }) };
    }
  };

  /* ---------- Baseball: nine innings on the numbers 1 to 9 ---------- */
  G.baseball = {
    init: function (s) { s.rounds = 9; s.runs = fill(s.n, 0); },
    dart: function (s, d) {
      var p = s.active, ev = []; s.turn.push(d);
      if (d.n === s.round && d.n > 0) { s.runs[p] += d.m; if (d.m === 3) ev.push({ k: 'good', m: 2, t: 'Triple', s: P(p) + ' scores three' }); }
      if (s.turn.length === 3) {
        if (advance(s) && s.round > s.rounds) { s.round = s.rounds; return finish(s, best(s.runs), ev, 'Most runs after ' + s.rounds + ' innings', true); }
      }
      return ev;
    },
    view: function (s) {
      return { title: 'Baseball', info: 'Inning ' + s.round + ' of ' + s.rounds, target: '' + s.round,
        hint: P(s.active) + ' is batting on the ' + s.round + '. Single one run, double two, treble three.',
        pad: { type: 'btn', cols: 4, btns: sdt(s.round) },
        rows: fill(s.n, function (q) { return { main: '' + s.runs[q], sub: s.runs[q] === 1 ? 'Run' : 'Runs' }; }) };
    }
  };

  /* ---------- Killer: hit your own double to arm, then take lives off everyone else's ---------- */
  G.killer = {
    init: function (s) {
      if (s.opts.nums) s.nums = s.opts.nums.slice();
      else { var pool = fill(20, function (k) { return k + 1; }); s.nums = fill(s.n, function () { return pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; }); }
      s.lives = fill(s.n, 3); s.out = fill(s.n, false); s.killer = fill(s.n, false);
    },
    dart: function (s, d) {
      var p = s.active, ev = [], q = d.m === 2 ? s.nums.indexOf(d.n) : -1; s.turn.push(d);
      if (q >= 0 && alive(s, q)) {
        if (q === p && !s.killer[p]) { s.killer[p] = true; ev.push({ k: 'good', m: 2, t: 'Killer', s: P(p) + ' is armed' }); }
        else if (q === p || s.killer[p]) {
          s.lives[q]--;
          if (s.lives[q] <= 0) { s.out[q] = true; ev.push({ k: 'bad', m: 3, t: 'Dead', s: q === p ? P(p) + ' took their own last life' : P(q) + ' is out' }); }
          else ev.push({ k: 'bad', m: 2, t: q === p ? 'Own goal' : 'Hit', s: P(q) + ' loses a life' });
        }
      }
      if (aliveCount(s) <= 1) return finish(s, lastAlive(s), ev, 'Last one standing');
      if (s.turn.length === 3 || s.out[p]) advance(s);
      return ev;
    },
    view: function (s) {
      var p = s.active, btns = [BTN.miss()];
      for (var q = 0; q < s.n; q++) if (alive(s, q)) btns.push({ l: 'D' + s.nums[q], s: P(q), d: { n: s.nums[q], m: 2 }, c: q === p ? 'own' : 'foe' });
      return { title: 'Killer', info: 'Round ' + s.round,
        hint: s.killer[p] ? P(p) + ' is a killer. Hit anyone else’s double to take a life.' : P(p) + ' needs double ' + s.nums[p] + ' to become a killer.',
        pad: { type: 'btn', cols: btns.length > 4 ? 3 : 2, btns: btns },
        rows: fill(s.n, function (q) { return { main: s.out[q] ? 'Out' : 'D' + s.nums[q], sub: s.out[q] ? '' : (s.killer[q] ? 'Killer' : 'Not armed'), lives: s.lives[q], out: s.out[q], tag: s.killer[q] && !s.out[q] ? 'Killer' : '' }; }) };
    }
  };

  /* ---------- Golf: hole N is the number N; up to three darts and the last one thrown counts ---------- */
  var GOLF_BTNS = [
    { l: '0', s: 'Par', d: { g: 0 }, c: 'p0' }, { l: '+1', s: 'Next door', d: { g: 1 }, c: 'p1' }, { l: '+2', s: '', d: { g: 2 }, c: 'p2' }, { l: '+3', s: 'Off board', d: { g: 3 }, c: 'p3' },
    { l: '-1', s: 'Inner', d: { g: -1 }, c: 'n1' }, { l: '-2', s: 'Double', d: { g: -2 }, c: 'n2' }, { l: '-3', s: 'Treble', d: { g: -3 }, c: 'n3' }, { l: '-4', s: '', d: { g: -4 }, c: 'n4' }
  ];
  var GOOD = ['Birdie', 'Eagle', 'Albatross', 'Condor'], BAD = ['Bogey', 'Double bogey', 'Triple bogey'];
  function golfLead(s) {
    var n = s.sc[0].length, p, tot;
    for (p = 1; p < s.n; p++) n = Math.min(n, s.sc[p].length);
    tot = fill(s.n, function (q) { return sum(s.sc[q].slice(0, n)); });
    var who = best(tot, true), sorted = tot.slice().sort(function (a, b) { return a - b; });
    return { n: n, tot: tot, who: who, margin: s.n > 1 ? sorted[1] - sorted[0] : 0 };
  }
  function golfKeep(s) {
    if (s.done || s.pend == null) return [];
    var sc = s.pend, p = s.active, ev = [];
    s.sc[p].push(sc); s.dartN = 0; s.pend = null; s.turn = [];
    if (sc < 0) ev.push({ k: 'good', m: Math.min(-sc, 4), t: GOOD[Math.min(-sc, 4) - 1], s: P(p) + ' ' + fmt(sc), golf: sc, p: p });
    else if (sc > 0) ev.push({ k: 'bad', m: Math.min(sc, 3), t: BAD[Math.min(sc, 3) - 1], s: P(p) + ' ' + fmt(sc), golf: sc, p: p });
    s.pos++;
    if (s.pos < s.order.length) { s.active = s.order[s.pos]; return ev; }
    var tot = fill(s.n, function (q) { return sum(s.sc[q]); }), L = best(tot, true);
    var sorted = tot.slice().sort(function (a, b) { return a - b; }), margin = s.n > 1 ? sorted[1] - sorted[0] : 0;
    if (s.round === s.holes) {
      s.pos = 0;
      return finish(s, s.n === 1 ? 0 : L, ev, s.n === 1 ? 'Round of ' + fmt(tot[0]) : (L >= 0 ? 'By ' + margin + ' over ' + s.holes + ' holes' : 'Level after ' + s.holes + ' holes'), true);
    }
    var prev = fill(s.n, function (q) { return tot[q] - s.sc[q][s.sc[q].length - 1]; }), was = best(prev, true);
    // Honours: lowest total throws first. Players who are level keep the order they had.
    var rank = {}; s.order.forEach(function (q, ix) { rank[q] = ix; });
    s.order = s.order.slice().sort(function (a, b) { return tot[a] - tot[b] || rank[a] - rank[b]; });
    s.round++; s.pos = 0; s.active = s.order[0];
    if (s.n > 1) ev.push({ k: 'info', m: 2, t: L < 0 ? 'All square' : P(L) + (L !== was ? ' takes the lead' : ' leads by ' + margin), s: P(s.active) + ' to shoot first on hole ' + s.round });
    return ev;
  }
  G.golf = {
    init: function (s) { s.holes = s.opts.holes || 18; s.sc = fill(s.n, function () { return []; }); s.dartN = 0; s.pend = null; },
    dart: function (s, d) {
      s.dartN++; s.pend = d.g; s.turn.push(d);
      return s.dartN >= 3 ? golfKeep(s) : [];
    },
    view: function (s) {
      var ld = golfLead(s), p = s.active;
      return { title: 'Golf', info: s.done ? 'Round finished' : 'Hole ' + s.round + ' of ' + s.holes, target: s.done ? '' : '' + s.round,
        hint: s.done ? 'Tap any score on the card to correct it.'
          : P(p) + ' on hole ' + s.round + '. Aim at the ' + s.round + '. Dart ' + (s.dartN + 1) + ' of 3.' + (s.pend != null ? ' Last dart: ' + fmt(s.pend) + '. Keep it or throw again.' : ''),
        pad: { type: 'btn', cols: 4, btns: GOLF_BTNS, keep: s.pend == null ? null : 'Keep ' + fmt(s.pend), golf: true },
        board: { type: 'golf', holes: s.holes, hole: s.round, sc: s.sc, lead: ld },
        lead: s.n === 1 ? (ld.n ? 'Round of ' + fmt(ld.tot[0]) : 'Tee off') : (ld.n ? (ld.who < 0 ? 'All square' : P(ld.who) + (s.done ? ' wins by ' : ' leads by ') + ld.margin) : 'Level at the start'),
        rows: fill(s.n, function (q) { var t = sum(s.sc[q]); return { main: fmt(t), sub: 'Thru ' + s.sc[q].length, sign: t }; }) };
    }
  };

  /* ---------- catalogue ---------- */
  var GAMES = [
    { id: 'x01', name: '301 / 501', blurb: 'The classic. Race down to zero and finish on a double.', min: 1, max: 6, pro: false,
      how: ['Everyone starts on the same score and subtracts what they throw.', 'First to hit exactly zero wins the leg.', 'With double-out on, the last dart must be a double or the bull.'] },
    { id: 'countup', name: 'Count-Up', blurb: 'Eight rounds. Highest total wins.', min: 1, max: 6, pro: false,
      how: ['Three darts a round for eight rounds.', 'Everything you hit is added to your total.', 'Highest total at the end wins.'] },
    { id: 'golf', name: 'Golf', blurb: 'Nine or eighteen holes, scored against par.', min: 1, max: 6, pro: true,
      how: ['Hole 1 is the 1, hole 2 is the 2, and so on.', 'Up to three darts a hole. The last dart you throw is the one that counts.', 'Treble -3, double -2, inner single -1, outer single par, next door +1, off the board +3.', 'Lowest total wins and throws first on the next hole.'] },
    { id: 'cricket', name: 'Cricket', blurb: 'Close 20 to 15 and the bull, then pile on points.', min: 2, max: 6, pro: true,
      how: ['Hit a number three times to close it. Doubles count twice, trebles three times.', 'Once you have closed a number, more hits score points until everyone else closes it too.', 'First to close everything while level or ahead on points wins.'] },
    { id: 'killer', name: 'Killer', blurb: 'Arm yourself, then take everyone out.', min: 2, max: 6, pro: true,
      how: ['Everyone is given a number and three lives.', 'Hit your own double to become a killer.', 'Killers take a life off a player by hitting that player’s double. Hit your own again and you lose one.', 'Last player with a life wins.'] },
    { id: 'atc', name: 'Around the Clock', blurb: '1 to 20 in order, then the bull.', min: 1, max: 6, pro: true,
      how: ['Hit 1, then 2, all the way to 20. Any part of the number counts.', 'Finish on the bull.', 'First round the board wins.'] },
    { id: 'shanghai', name: 'Shanghai', blurb: 'Seven rounds, and one shot at an instant win.', min: 1, max: 6, pro: true,
      how: ['Round 1 is played on the 1, round 2 on the 2, up to 7.', 'Singles score the number, doubles twice, trebles three times.', 'Single, double and treble of the number in one turn is a Shanghai and wins outright.'] },
    { id: 'halve', name: 'Halve-It', blurb: 'Hit the target or lose half your score.', min: 1, max: 6, pro: true,
      how: ['Seven targets: 20, 16, double 7, 14, 18, treble 10, bull.', 'Score whatever you hit on the target.', 'Miss it with all three darts and your score is halved.'] },
    { id: 'bobs', name: "Bob's 27", blurb: 'The doubles drill that bites back.', min: 1, max: 6, pro: true,
      how: ['Start on 27 and go for every double from 1 to 20, then the bull.', 'Each double you hit adds its value.', 'A blank round takes that double’s value away. Drop below 1 and you are out.'] },
    { id: 'baseball', name: 'Baseball', blurb: 'Nine innings. Most runs wins.', min: 1, max: 6, pro: true,
      how: ['Inning 1 is played on the 1, inning 2 on the 2, up to 9.', 'Single one run, double two, treble three.', 'Most runs after nine innings wins.'] },
    { id: 'knockout', name: 'Knockout', blurb: 'Beat the score before you or lose a life.', min: 2, max: 6, pro: true,
      how: ['The first player sets a score with three darts.', 'Each player after that must beat the score thrown just before them.', 'Fail and you lose one of three lives. Last one standing wins.'] },
    { id: 'gotcha', name: 'Gotcha', blurb: 'Race up to 301 and send rivals back to zero.', min: 2, max: 6, pro: true,
      how: ['Start on zero and add up to exactly 301.', 'Land on the same total as another player and they go back to zero.', 'Go over 301 and the turn does not count.'] }
  ];
  var BY = {}; GAMES.forEach(function (g) { BY[g.id] = g; });

  /* ---------- public API ---------- */
  function create(id, n, opts) {
    opts = opts || {};
    var s = { game: id, n: n, opts: opts, order: fill(n, function (k) { return k; }), pos: 0, active: 0, turn: [], round: 1, done: false, winner: null, id: opts.id || 0 };
    var first = opts.first || 0;
    if (first > 0 && first < n) s.order = s.order.slice(first).concat(s.order.slice(0, first));
    s.active = s.starter = s.order[0];
    G[id].init(s);
    return s;
  }
  function dart(s, d) { return s.done ? [] : (G[s.game].dart(s, d) || []); }
  function keep(s) { return s.game === 'golf' ? golfKeep(s) : []; }
  function view(s) {
    var v = G[s.game].view(s);
    v.slots = s.turn.map(dartLabel); v.turnTotal = TOTALS[s.game] ? turnSum(s) : null;   // only where the three-dart total means something
    return v;
  }
  /** True until the first dart: the game can still be reconfigured or abandoned without loss. */
  function fresh(s) {
    if (s.done || s.turn.length || s.round > 1 || s.pos > 0) return false;
    return s.game !== 'x01' || !sum(s.darts);
  }
  function rematch(s, id) {
    var o = {}; for (var k in s.opts) o[k] = s.opts[k];
    o.id = id || 0; o.first = (s.starter + 1) % s.n; delete o.nums;
    if (s.game === 'x01') { o.legs = s.legs; o.leg = s.leg + 1; }
    return create(s.game, s.n, o);
  }
  /** Correct an already-entered golf hole (k is 1-based). Does not reorder the hole in play. */
  function golfEdit(s, p, k, score) {
    if (s.game !== 'golf' || k < 1 || k > s.sc[p].length) return false;
    s.sc[p][k - 1] = score;
    if (s.done) { var tot = fill(s.n, function (q) { return sum(s.sc[q]); }); s.winner = s.n === 1 ? 0 : best(tot, true); }
    return true;
  }

  return { GAMES: GAMES, game: function (id) { return BY[id]; }, create: create, dart: dart, keep: keep, view: view, fresh: fresh, rematch: rematch,
    golfEdit: golfEdit, checkout: checkout, dartLabel: dartLabel, sum: sum, fmt: fmt };
});
