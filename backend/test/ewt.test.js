// Unit tests for the EWT rules in proposal section 4.4.2.
// No server or database needed: a fake database returns chosen numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getAverageServiceMinutes, computeEWT } = require('../src/services/queueService');

// Answers each query queueService makes, based on the SQL text
const fakeDb = ({ defaultMinutes = 8, completedToday = 0, durations = [], ahead = 0 } = {}) => {
  const db = {
    limitUsed: null,
    async query(sql, params) {
      if (sql.includes('default_service_minutes')) {
        return { rows: [{ default_service_minutes: defaultMinutes }] };
      }
      if (sql.includes('AS n')) {                 // completed in today's session
        return { rows: [{ n: completedToday }] };
      }
      if (sql.includes('AS minutes')) {           // the rolling window
        db.limitUsed = params[1];
        return { rows: durations.slice(0, params[1]).map((m) => ({ minutes: String(m) })) };
      }
      if (sql.includes('SELECT COUNT(*) FROM queue_tokens')) {  // patients ahead
        return { rows: [{ count: String(ahead) }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return db;
};

const token = {
  id: 99, service_point_id: 1, queue_date: '2026-10-28', priority: 'normal', sequence_no: 5,
};

test('Fewer than 3 completed today: the 8-minute default is used', async () => {
  const db = fakeDb({ completedToday: 2, durations: [4, 6] });
  const r = await getAverageServiceMinutes(db, 1);
  assert.equal(r.avg, 8);
  assert.equal(r.source, 'default');
});

test('Exactly 3 completed today: switches to the rolling average', async () => {
  const db = fakeDb({ completedToday: 3, durations: [4, 6, 5] });
  const r = await getAverageServiceMinutes(db, 1);
  assert.equal(r.avg, 5);
  assert.equal(r.source, 'rolling_average');
});

test('Rolling window is the last 10 completed consultations', async () => {
  // 12 durations: the 10 most recent are 2 minutes, the 2 oldest are 50 minutes
  const db = fakeDb({ completedToday: 12, durations: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 50, 50] });
  const r = await getAverageServiceMinutes(db, 1);
  assert.equal(db.limitUsed, 10);
  assert.equal(r.avg, 2);
  assert.equal(r.sample_size, 10);
});

test('A service point default other than 8 is respected', async () => {
  const db = fakeDb({ defaultMinutes: 12, completedToday: 0 });
  const r = await getAverageServiceMinutes(db, 1);
  assert.equal(r.avg, 12);
});

test('EWT = patients ahead x average (proposal example: 3 x 8 = 24)', async () => {
  const db = fakeDb({ completedToday: 0, ahead: 3 });
  const r = await computeEWT(db, token);
  assert.equal(r.patients_ahead, 3);
  assert.equal(r.ewt_minutes, 24);
});

test('Nobody ahead: EWT is 0', async () => {
  const db = fakeDb({ completedToday: 5, durations: [6, 6, 6, 6, 6], ahead: 0 });
  const r = await computeEWT(db, token);
  assert.equal(r.ewt_minutes, 0);
});

test('EWT is rounded to whole minutes', async () => {
  // average 4.5 min, 3 ahead = 13.5 -> 14
  const db = fakeDb({ completedToday: 4, durations: [4, 5, 4, 5], ahead: 3 });
  const r = await computeEWT(db, token);
  assert.equal(r.avg_service_minutes, 4.5);
  assert.equal(r.ewt_minutes, 14);
});