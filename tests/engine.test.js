const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../www/engine.js');

const value = (l) => l === 'Bull' ? 50 : l === '25' ? 25 : l[0] === 'T' ? 3 * +l.slice(1) : l[0] === 'D' ? 2 * +l.slice(1) : +l;
const isDouble = (l) => l === 'Bull' || l[0] === 'D';
const throwAll = (s, darts) => darts.map(([n, m]) => E.x01Throw(s, n, m));

test('checkout: known finishes', () => {
  assert.deepEqual(E.checkout(170, 3, true), ['T20', 'T20', 'Bull']);
  assert.deepEqual(E.checkout(100, 3, true), ['T20', 'D20']);
  assert.deepEqual(E.checkout(40, 1, true), ['D20']);
  assert.deepEqual(E.checkout(50, 1, true), ['Bull']);
  assert.equal(E.checkout(171, 3, true), null);
  assert.equal(E.checkout(1, 3, true), null);
});

test('checkout: every double-out finish is valid, and only the bogey numbers have none', () => {
  const bogey = new Set([169, 168, 166, 165, 163, 162, 159]);
  for (let rem = 2; rem <= 170; rem++) {
    const c = E.checkout(rem, 3, true);
    if (bogey.has(rem)) { assert.equal(c, null, `${rem} should have no finish`); continue; }
    assert.ok(c, `${rem} should have a finish`);
    assert.ok(c.length <= 3);
    assert.equal(c.reduce((t, l) => t + value(l), 0), rem, `${rem}: ${c}`);
    assert.ok(isDouble(c[c.length - 1]), `${rem} must end on a double: ${c}`);
  }
});

test('checkout: respects darts in hand and straight-out', () => {
  assert.equal(E.checkout(100, 1, true), null);
  assert.equal(E.checkout(141, 2, true), null);
  for (let rem = 1; rem <= 60; rem++) {
    const c = E.checkout(rem, 2, false);
    assert.ok(c, `${rem} straight out`);
    assert.equal(c.reduce((t, l) => t + value(l), 0), rem);
  }
});

test('x01: three darts make a turn and the throw passes', () => {
  const s = E.newX01({ start: 301 });
  const ev = throwAll(s, [[20, 3], [20, 3], [20, 3]]);
  assert.equal(ev[2].type, 'turn'); assert.equal(ev[2].scored, 180);
  assert.deepEqual(s.score, [121, 301]);
  assert.equal(s.active, 1); assert.equal(s.turn.length, 0);
  assert.equal(E.x01Avg(s, 0), 180);
});

test('x01: bust below zero, on one, and on a non-double finish all revert the turn', () => {
  for (const darts of [[[20, 3]], [[19, 1], [20, 1]], [[20, 1], [20, 1]]]) {
    const s = E.newX01({ start: 301 }); s.score[0] = 40; s.turnStart = 40;
    const ev = throwAll(s, darts);
    assert.equal(ev[ev.length - 1].type, 'bust', JSON.stringify(darts));
    assert.equal(s.score[0], 40); assert.equal(s.active, 1); assert.equal(s.bust, 0);
    assert.equal(s.pts[0], 0, 'points scored earlier in a bust turn are taken back');
  }
});

test('x01: finishing on a double or the bull wins the leg', () => {
  const s = E.newX01({ start: 301 }); s.score[0] = 40; s.turnStart = 40;
  const ev = E.x01Throw(s, 20, 2);
  assert.equal(ev.type, 'win'); assert.equal(s.winner, 0); assert.deepEqual(s.legs, [1, 0]);
  assert.equal(E.x01Throw(s, 20, 1), null, 'no darts after the leg is won');
  const b = E.newX01({ start: 301 }); b.score[0] = 50; b.turnStart = 50;
  assert.equal(E.x01Throw(b, 25, 2).type, 'win');
});

test('x01: straight out allows any finishing dart', () => {
  const s = E.newX01({ start: 301, dblOut: false }); s.score[0] = 20; s.turnStart = 20;
  assert.equal(E.x01Throw(s, 20, 1).type, 'win');
});

test('x01: next leg swaps the starter and keeps the legs', () => {
  const s = E.newX01({ start: 301 }); s.score[0] = 40; s.turnStart = 40; E.x01Throw(s, 20, 2);
  const n = E.x01Next(s, { start: 501, id: 7 });
  assert.equal(n.starter, 1); assert.equal(n.active, 1); assert.deepEqual(n.legs, [1, 0]);
  assert.equal(n.leg, 2); assert.deepEqual(n.score, [501, 501]); assert.equal(n.id, 7);
  assert.ok(E.x01Fresh(n));
});

test('x01: a treble bull does not exist', () => {
  const s = E.newX01(); assert.equal(E.x01Throw(s, 25, 3), null); assert.equal(s.darts[0], 0);
});

const hole = (g, a, b) => { // both players keep their first dart
  const first = g.first;
  E.golfDart(g, first === 0 ? a : b); E.golfKeep(g);
  E.golfDart(g, first === 0 ? b : a); return E.golfKeep(g);
};

test('golf: the last dart thrown counts and the third is kept automatically', () => {
  const g = E.newGolf({ holes: 9 });
  assert.equal(E.golfDart(g, -2)[0].type, 'pending');
  E.golfDart(g, 1);
  const ev = E.golfDart(g, 3);
  assert.equal(ev[0].type, 'score'); assert.equal(ev[0].score, 3);
  assert.deepEqual(g.sc[0], [3]); assert.equal(g.active, 1); assert.equal(g.dart, 0);
});

test('golf: lowest total has the honour, and it stays put when level', () => {
  const g = E.newGolf({ holes: 9, starter: 0 });
  let ev = hole(g, 0, -1);
  assert.equal(g.first, 1); assert.equal(g.active, 1); assert.equal(g.hole, 2);
  const h = ev.find((e) => e.type === 'hole');
  assert.equal(h.lead, 1); assert.equal(h.prevLead, -1); assert.equal(h.first, 1); assert.equal(h.margin, 1);
  hole(g, -1, 0); // level again: player 2 keeps the honour
  assert.equal(E.golfLead(g).who, -1); assert.equal(g.first, 1);
  hole(g, -2, 0);
  assert.equal(g.first, 0); assert.deepEqual(g.sc, [[0, -1, -2], [-1, 0, 0]]);
});

test('golf: the round ends after the last hole with the right winner', () => {
  const g = E.newGolf({ holes: 9 });
  let ev;
  for (let i = 0; i < 9; i++) ev = hole(g, -1, 0);
  const d = ev.find((e) => e.type === 'done');
  assert.ok(g.done); assert.equal(d.winner, 0); assert.equal(d.margin, 9); assert.equal(d.a, -9); assert.equal(d.b, 0);
  assert.deepEqual(E.golfDart(g, 0), [], 'no darts after the round is done');
  const t = E.newGolf({ holes: 9 });
  for (let i = 0; i < 9; i++) ev = hole(t, 0, 0);
  assert.equal(ev.find((e) => e.type === 'done').winner, -1);
});

test('golf: editing an old hole changes the totals but not a hole that has not been played', () => {
  const g = E.newGolf({ holes: 9 });
  hole(g, 0, 0);
  assert.ok(E.golfEdit(g, 0, 1, -3)); assert.equal(E.golfLead(g).who, 0); assert.equal(E.golfLead(g).a, -3);
  assert.equal(E.golfEdit(g, 0, 2, -3), false);
});

test('golf: mid-hole standings only count holes both players have finished', () => {
  const g = E.newGolf({ holes: 9 });
  E.golfDart(g, -3); E.golfKeep(g);
  assert.equal(E.golfLead(g).who, -1); assert.equal(E.golfLead(g).n, 0);
});
