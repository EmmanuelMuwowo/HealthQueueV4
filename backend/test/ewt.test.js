// Unit tests for the HealthQueue EWT engine. No server or database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ewma, categoryAHT, remainingMinutes, band, estimateFromQueue, WINDOW, MIN_COMPLETED,
} = require('../src/services/queueService');

const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} is not close to ${b}`);
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const w = (id, category_id) => ({ id, category_id, status: 'waiting' });

test('EWMA weights the newest consultation by 0.3', () => {
  // oldest 10, then 10, then 20: 10 -> 10 -> 0.3*20 + 0.7*10 = 13
  near(ewma([10, 10, 20]), 13);
});

test('EWMA of identical durations is that duration', () => {
  near(ewma([6, 6, 6, 6]), 6);
});

test(`Fewer than ${MIN_COMPLETED} completed: the category default is used`, () => {
  const r = categoryAHT(12, [4, 5]);
  assert.equal(r.aht, 12);
  assert.equal(r.source, 'default');
});

test(`${MIN_COMPLETED} or more completed: the EWMA is used`, () => {
  const r = categoryAHT(12, [4, 4, 4]);
  near(r.aht, 4);
  assert.equal(r.source, 'ewma');
});

test('The window size is 10', () => {
  assert.equal(WINDOW, 10);
});

test('Proposal example: 3 patients ahead x 8 minutes = 24', () => {
  const e = estimateFromQueue({
    tokens: [w(1, 'x'), w(2, 'x'), w(3, 'x'), w(4, 'x')],
    ahtFor: () => 8,
  });
  assert.equal(e.get(4).patients_ahead, 3);
  assert.equal(e.get(4).ewt_minutes, 24);
});

test('Each patient ahead counts their own visit type (5 + 12 + 25 = 42)', () => {
  const aht = { refill: 5, general: 12, chronic: 25 };
  const e = estimateFromQueue({
    tokens: [w(1, 'refill'), w(2, 'general'), w(3, 'chronic'), w(4, 'general')],
    ahtFor: (c) => aht[c],
  });
  assert.equal(e.get(4).ewt_minutes, 42);
});

test('Two clinicians and a 10% buffer: 42 / 2 x 1.1 = 23.1', () => {
  const aht = { refill: 5, general: 12, chronic: 25 };
  const e = estimateFromQueue({
    tokens: [w(1, 'refill'), w(2, 'general'), w(3, 'chronic'), w(4, 'general')],
    ahtFor: (c) => aht[c], clinicians: 2, buffer: 0.1,
  });
  near(e.get(4).ewt_exact_minutes, 23.1);
});

test('Current consultation counts only its remaining time (6 of 8 used: 2 + 2 x 8 = 18)', () => {
  const e = estimateFromQueue({
    tokens: [
      { id: 1, category_id: 'x', status: 'in_consultation', consultation_start: minutesAgo(6) },
      w(2, 'x'), w(3, 'x'), w(4, 'x'),
    ],
    ahtFor: () => 8,
  });
  near(e.get(4).ewt_exact_minutes, 18, 0.2);
});

test('An overrunning consultation still counts 20% of its AHT', () => {
  assert.equal(remainingMinutes(10, 25), 2);
  assert.equal(remainingMinutes(10, 4), 6);
});

test('A called patient (not started) counts a full AHT', () => {
  const e = estimateFromQueue({
    tokens: [{ id: 1, category_id: 'x', status: 'called' }, w(2, 'x')],
    ahtFor: () => 8,
  });
  assert.equal(e.get(2).ewt_minutes, 8);
});

test('Nobody ahead: estimate 0, band 0 to 5', () => {
  const e = estimateFromQueue({ tokens: [w(1, 'x')], ahtFor: () => 8 });
  assert.equal(e.get(1).ewt_minutes, 0);
  assert.equal(e.get(1).ewt_low, 0);
  assert.equal(e.get(1).ewt_high, 5);
});

test('Band: 80% to 130%, rounded outwards to 5 minutes (22 -> 15 to 30)', () => {
  assert.deepEqual(band(22), { ewt_low: 15, ewt_high: 30 });
});

test('Band always contains the estimate', () => {
  for (const ewt of [1, 3, 7, 12, 24, 37, 60, 95]) {
    const b = band(ewt);
    assert.ok(b.ewt_low <= ewt && ewt <= b.ewt_high, `band ${b.ewt_low}-${b.ewt_high} misses ${ewt}`);
  }
});