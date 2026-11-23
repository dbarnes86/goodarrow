const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../www/engine.js');

const value = (l) => l === 'Bull' ? 50 : l === '25' ? 25 : l[0] === 'T' ? 3 * +l.slice(1) : l[0] === 'D' ? 2 * +l.slice(1) : +l;
const isDouble = (l) => l === 'Bull' || l[0] === 'D';
const D = (n, m = 1) => ({ n, m });
const MISS = D(0, 1);
/** Throw darts in order, returning every event. */
const play = (s, darts) => darts.flatMap((d) => E.dart(s, d));
const titles = (ev) => ev.map((e) => e.t);

test('catalogue: twelve games, each creatable and viewable at its player limits', () => {
  assert.equal(E.GAMES.length, 12);
  for (const g of E.GAMES) for (const n of [g.min, g.max]) {
    const s = E.create(g.id, n, {}), v = E.view(s);
    assert.equal(v.rows.length, n, g.id); assert.ok(v.title && v.hint && v.pad, g.id);
    assert.ok(E.fresh(s), g.id + ' starts fresh');
    assert.ok(g.how.length >= 3 && g.blurb, g.id + ' explains itself');
  }
  assert.deepEqual(E.GAMES.filter((g) => !g.pro).map((g) => g.id), ['x01', 'countup']);
});

test('every game can be played to a finish by players who only miss or only hit', () => {
  for (const g of E.GAMES) for (const hit of [false, true]) {
    const s = E.create(g.id, Math.max(2, g.min), { nums: [1, 2] });
    let guard = 0;
    while (!s.done && guard++ < 5000) {
      const v = E.view(s), pad = v.pad;
      let d;
      if (hit && g.id === 'x01') {           // a sensible player: take the suggested finish when there is one
        const c = E.checkout(s.score[s.active], 3 - s.turn.length, true), l = c && c[0];
        d = !l ? D(20, 3) : l === 'Bull' ? D(25, 2) : l === '25' ? D(25, 1) : l[0] === 'T' ? D(+l.slice(1), 3) : l[0] === 'D' ? D(+l.slice(1), 2) : D(+l, 1);
      } else if (hit && g.id === 'gotcha') {
        const need = s.target - s.total[s.active]; d = need >= 60 ? D(s.active ? 19 : 20, 3) : D(Math.min(need, 20), 1); // different trebles, or the two players reset each other forever
      } else if (g.id === 'cricket') {
        d = guard % 7 === 0 ? D(25, 1) : D(pad.nums[(guard + Math.floor(guard / 6)) % 6], hit ? 3 : 1);
      } else if (pad.type === 'full') d = hit ? D(20, 3) : (g.id === 'x01' || g.id === 'gotcha' || g.id === 'cricket' ? D(guard % 7 === 0 ? 20 : 1, guard % 2 ? 2 : 1) : D(guard % 5, 1));
      else d = pad.btns[hit ? pad.btns.length - 1 : (guard % 4 === 0 ? pad.btns.length - 1 : 0)].d;
      E.dart(s, d);
      if (s.game === 'golf' && s.pend != null) E.keep(s);
    }
    assert.ok(s.done, `${g.id} (${hit ? 'hits' : 'mixed'}) reaches an end`);
    assert.ok(s.winner >= -1 && s.winner < s.n, g.id);
    assert.deepEqual(E.dart(s, D(20, 1)), [], g.id + ' takes no darts once done');
    assert.equal(E.view(s).rows.length, s.n);
  }
});

test('checkout: known finishes, and only the bogey numbers have none', () => {
  assert.deepEqual(E.checkout(170, 3, true), ['T20', 'T20', 'Bull']);
  assert.deepEqual(E.checkout(100, 3, true), ['T20', 'D20']);
  assert.deepEqual(E.checkout(40, 1, true), ['D20']);
  assert.equal(E.checkout(171, 3, true), null); assert.equal(E.checkout(100, 1, true), null);
  const bogey = new Set([169, 168, 166, 165, 163, 162, 159]);
  for (let rem = 2; rem <= 170; rem++) {
    const c = E.checkout(rem, 3, true);
    if (bogey.has(rem)) { assert.equal(c, null); continue; }
    assert.equal(c.reduce((t, l) => t + value(l), 0), rem, `${rem}: ${c}`);
    assert.ok(isDouble(c[c.length - 1]) && c.length <= 3);
  }
});

test('x01: turns, busts, double-out, win, three players and the next leg', () => {
  const s = E.create('x01', 3, { start: 301 });
  const ev = play(s, [D(20, 3), D(20, 3), D(20, 3)]);
  assert.deepEqual(titles(ev), ['180!']); assert.deepEqual(s.score, [121, 301, 301]); assert.equal(s.active, 1);
  play(s, [MISS, MISS, MISS]); assert.equal(s.active, 2);
  play(s, [MISS, MISS, MISS]); assert.equal(s.active, 0);
  // 121 -> 61 -> 1 cannot be finished on a double
  assert.deepEqual(titles(play(s, [D(20, 3), D(20, 3)])), ['Bust']);
  assert.equal(s.score[0], 121); assert.equal(s.active, 1); assert.equal(s.bust, 0); assert.equal(s.pts[0], 180);
  play(s, [MISS, MISS, MISS, MISS, MISS, MISS]);
  const win = play(s, [D(20, 3), D(15, 3), D(8, 2)]);
  assert.equal(win[win.length - 1].k, 'win'); assert.equal(s.winner, 0); assert.deepEqual(s.legs, [1, 0, 0]);
  const n = E.rematch(s, 9);
  assert.equal(n.active, 1); assert.deepEqual(n.legs, [1, 0, 0]); assert.equal(n.leg, 2); assert.deepEqual(n.score, [301, 301, 301]);
  const so = E.create('x01', 1, { start: 301, dblOut: false }); so.score[0] = 20; so.turnStart = 20;
  assert.equal(E.dart(so, D(20, 1))[0].k, 'win', 'straight out');
  assert.deepEqual(E.dart(E.create('x01', 2, {}), D(25, 3)), [], 'a treble bull does not exist');
});

test('count-up: eight rounds, highest total, ties are level', () => {
  const s = E.create('countup', 2, {});
  for (let r = 0; r < 8; r++) play(s, [D(20, 1), D(20, 1), D(20, 1), D(19, 1), D(19, 1), D(19, 1)]);
  assert.ok(s.done); assert.equal(s.winner, 0); assert.deepEqual(s.total, [480, 456]);
  const t = E.create('countup', 2, {});
  for (let r = 0; r < 16; r++) play(t, [D(5, 1), D(5, 1), D(5, 1)]);
  assert.equal(t.winner, -1);
});

test('gotcha: landing on a rival resets them, going over is a bust, exact wins', () => {
  const s = E.create('gotcha', 2, {});
  play(s, [D(20, 1), D(20, 1), D(20, 1)]);              // p0 60
  const ev = play(s, [D(20, 1), D(20, 1), D(20, 1)]);  // p1 lands on 60
  assert.ok(titles(ev).includes('Gotcha!')); assert.deepEqual(s.total, [0, 60]);
  s.total = [290, 60]; s.active = 0; s.pos = 0; s.turn = []; s.turnStart = 290;
  assert.deepEqual(titles(play(s, [D(20, 1)])), ['Bust']); assert.equal(s.total[0], 290); assert.equal(s.active, 1);
  play(s, [MISS, MISS, MISS]);
  const win = play(s, [D(11, 1)]); assert.equal(win[0].k, 'win'); assert.equal(s.winner, 0);
});

test('knockout: must beat the previous score, three lives, last one standing', () => {
  const s = E.create('knockout', 2, {});
  play(s, [D(20, 1), D(20, 1), D(20, 1)]); assert.equal(s.toBeat, 60);
  assert.deepEqual(titles(play(s, [D(20, 1), D(20, 1), D(20, 1)])), ['Life lost'], 'equal is not enough');
  assert.deepEqual(s.lives, [3, 2]);
  play(s, [D(20, 3), D(20, 1), D(1, 1)]);   // p0 81 beats 60
  play(s, [MISS, MISS, MISS]);              // p1 fails: 1 life
  play(s, [D(1, 1), MISS, MISS]);           // p0 1 beats 0
  const ev = play(s, [MISS, MISS, MISS]);   // p1 fails: out
  assert.ok(titles(ev).includes('Knocked out')); assert.ok(s.done); assert.equal(s.winner, 0);
});

test('cricket: closing, scoring on open numbers only, and the win condition', () => {
  const s = E.create('cricket', 2, {});
  play(s, [D(20, 3), D(20, 3), D(19, 1)]);
  assert.equal(s.marks[0][0], 3); assert.equal(s.pts[0], 60, 'three extra 20s score while the other player is open');
  play(s, [D(20, 3), D(20, 1), MISS]);
  assert.equal(s.marks[1][0], 3); assert.equal(s.pts[1], 0, 'no points on a number everyone has closed');
  play(s, [D(20, 1), D(25, 2), D(25, 1)]);
  assert.equal(s.pts[0], 60); assert.equal(s.marks[0][6], 3, 'double bull is two marks');
  play(s, [MISS, MISS, MISS]);
  play(s, [D(19, 2), D(18, 3), D(17, 3)]);
  play(s, [MISS, MISS, MISS]);
  const ev = play(s, [D(16, 3), D(15, 3)]);
  assert.equal(ev[ev.length - 1].k, 'win'); assert.equal(s.winner, 0);
  // closing everything while behind on points is not a win
  const b = E.create('cricket', 2, {}); b.marks[0] = [3, 3, 3, 3, 3, 3, 2]; b.pts = [0, 40];
  play(b, [D(25, 1)]); assert.ok(!b.done);
  // ...but once every player has closed everything, the points decide it
  const c = E.create('cricket', 2, {}); c.marks = [[3, 3, 3, 3, 3, 3, 2], [3, 3, 3, 3, 3, 3, 3]]; c.pts = [0, 40];
  play(c, [D(25, 1)]); assert.ok(c.done); assert.equal(c.winner, 1);
});

test('around the clock: in order, any segment counts, bull to finish', () => {
  const s = E.create('atc', 2, {});
  play(s, [D(1, 3), D(3, 1), D(2, 2)]); assert.equal(s.at[0], 3, 'the 3 thrown before the 2 does not count');
  s.at[0] = 21; s.active = 0; s.pos = 0; s.turn = [];
  play(s, [D(25, 1)]); assert.ok(s.done); assert.equal(s.winner, 0);
});

test('shanghai: scores on the round number, and single-double-treble wins outright', () => {
  const s = E.create('shanghai', 2, {});
  play(s, [D(1, 3), D(1, 3), D(5, 3)]); assert.equal(s.score[0], 6);
  play(s, [MISS, MISS, MISS]);
  const ev = play(s, [D(2, 1), D(2, 3), D(2, 2)]);
  assert.ok(titles(ev).includes('Shanghai!')); assert.ok(s.done); assert.equal(s.winner, 0);
  const t = E.create('shanghai', 2, {});
  for (let r = 1; r <= 7; r++) play(t, [D(r, 1), MISS, MISS, D(r, 2), MISS, MISS]);
  assert.ok(t.done); assert.equal(t.winner, 1); assert.deepEqual(t.score, [28, 56]);
});

test('halve-it: hits score, a blank round halves (rounding up), specific double and treble targets', () => {
  const s = E.create('halve', 2, {});
  play(s, [D(20, 1), D(20, 3), MISS]); assert.equal(s.score[0], 120);
  assert.deepEqual(titles(play(s, [D(19, 3), MISS, MISS])), ['Halved']); assert.equal(s.score[1], 20);
  play(s, [MISS, MISS, MISS]); assert.equal(s.score[0], 60);            // round 2: 16
  play(s, [D(16, 1), MISS, MISS]); assert.equal(s.score[1], 36);
  play(s, [D(7, 1), D(7, 3), MISS]); assert.equal(s.score[0], 30, 'only double 7 counts in round 3');
  play(s, [D(7, 2), MISS, MISS]); assert.equal(s.score[1], 50);
  s.score = [5, 50]; play(s, [MISS, MISS, MISS]); assert.equal(s.score[0], 3, '5 halves to 3');
});

test("bob's 27: doubles add, a blank round subtracts, below one is out", () => {
  const s = E.create('bobs', 2, {});
  play(s, [D(1, 2), D(1, 2), D(1, 1)]); assert.equal(s.score[0], 31);
  play(s, [MISS, MISS, MISS]); assert.equal(s.score[1], 25);
  s.score = [3, 25]; s.round = 2;
  const ev = play(s, [MISS, MISS, MISS]);
  assert.ok(titles(ev).includes('Bust')); assert.ok(s.out[0]); assert.equal(s.active, 1);
  play(s, [D(2, 2), MISS, MISS]); assert.equal(s.active, 1, 'the player still in keeps throwing'); assert.equal(s.round, 3);
});

test('baseball: runs on the inning number over nine innings', () => {
  const s = E.create('baseball', 2, {});
  for (let r = 1; r <= 9; r++) play(s, [D(r, 3), D(r, 1), MISS, D(r, 2), D(20, 3), MISS]);
  assert.ok(s.done); assert.deepEqual(s.runs, [36, 18]); assert.equal(s.winner, 0);
});

test('killer: arm on your own double, take lives, own double costs a killer a life', () => {
  const s = E.create('killer', 3, { nums: [5, 12, 20] });
  assert.deepEqual(titles(play(s, [D(12, 2), D(5, 2), D(12, 2)])), ['Killer', 'Hit'], 'no damage before arming');
  assert.deepEqual(s.lives, [3, 2, 3]); assert.ok(s.killer[0]);
  play(s, [MISS, MISS, MISS, MISS, MISS, MISS]);
  assert.deepEqual(titles(play(s, [D(5, 2), D(12, 2), D(12, 2)])), ['Own goal', 'Hit', 'Dead']);
  assert.deepEqual(s.lives, [2, 0, 3]); assert.ok(s.out[1]); assert.equal(s.active, 2, 'the dead player is skipped');
  play(s, [MISS, MISS, MISS]);
  const ev = play(s, [D(20, 2), D(20, 2), D(20, 2)]);
  assert.equal(ev[ev.length - 1].k, 'win'); assert.equal(s.winner, 0);
  const r = E.create('killer', 6, {}); assert.equal(new Set(r.nums).size, 6, 'numbers are distinct');
});

const hole = (s, scores) => { let ev = []; for (let k = 0; k < s.n; k++) { const p = s.active; E.dart(s, { g: scores[p] }); ev = ev.concat(E.keep(s)); } return ev; };

test('golf: last dart counts, third dart is kept, honours by total with ties keeping their order', () => {
  const s = E.create('golf', 3, { holes: 9 });
  E.dart(s, { g: -2 }); E.dart(s, { g: 1 }); const ev = E.dart(s, { g: 3 });
  assert.equal(ev[0].t, 'Triple bogey'); assert.deepEqual(s.sc[0], [3]); assert.equal(s.active, 1);
  E.dart(s, { g: 0 }); E.keep(s); E.dart(s, { g: 0 }); const h = E.keep(s);
  assert.deepEqual(s.order, [1, 2, 0], 'level players keep their order; the leader goes first'); assert.equal(s.round, 2);
  assert.match(h[h.length - 1].t, /All square/);
  const h2 = hole(s, [0, 0, -1]);
  assert.deepEqual(s.order, [2, 1, 0]); assert.match(h2[h2.length - 1].t, /\{2\} takes the lead/);
  assert.match(h2[h2.length - 1].s, /\{2\} to shoot first on hole 3/);
});

test('golf: finishing, the winner, editing, and a solo round', () => {
  const s = E.create('golf', 2, { holes: 9 });
  let ev; for (let i = 0; i < 9; i++) ev = hole(s, [-1, 0]);
  assert.ok(s.done); assert.equal(s.winner, 0); assert.ok(ev[ev.length - 1].drum);
  assert.ok(E.golfEdit(s, 1, 1, -4)); assert.ok(E.golfEdit(s, 1, 2, -4)); assert.ok(E.golfEdit(s, 1, 3, -4));
  assert.equal(s.winner, 1, 'an edit after the round can change the winner');
  assert.equal(E.golfEdit(s, 0, 10, 0), false);
  const solo = E.create('golf', 1, { holes: 9 });
  for (let i = 0; i < 9; i++) hole(solo, [-1]);
  assert.ok(solo.done); assert.equal(solo.winner, 0);
  const lead = E.view(E.create('golf', 2, {})).board.lead; assert.equal(lead.n, 0); assert.equal(lead.who, -1);
});

test('rematch rotates who throws first, even after golf has reordered the players', () => {
  const s = E.create('golf', 3, { holes: 9 }); hole(s, [0, -1, -2]);
  assert.deepEqual(s.order, [2, 1, 0]);
  assert.equal(E.rematch(s, 1).active, 1);
  assert.equal(E.rematch(E.create('countup', 3, { first: 2 }), 1).active, 0);
});
