const BASE = 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};

const get = async (path, token) => {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() };
};

const login = async (username) => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Demo@1234' }),
  });
  if (!res.ok) throw new Error(`Login failed for ${username} (HTTP ${res.status})`);
  return (await res.json()).token;
};

// Our values never contain commas, so a plain split is enough here
const parseCsv = (text) => text.trim().split(/\r?\n/).map((line) => line.split(','));

(async () => {
  try {
    const manager = await login('manager1');
    const clinician = await login('clinician1');

    const expected = [
      'date', 'token', 'service_point', 'visit_type', 'priority', 'status',
      'arrived', 'called', 'consultation_start', 'consultation_end',
      'wait_minutes', 'service_minutes',
    ];

    const exp = await get('/analytics/export?days=14', manager);
    check('Export loads as CSV', exp.status === 200 && exp.type.includes('text/csv'), `status ${exp.status}`);
    if (exp.status !== 200) return;

    const table = parseCsv(exp.text);
    const header = table[0];
    const rows = table.slice(1);
    check('Header has the expected columns', header.join(',') === expected.join(','), header.join(','));
    check('No name or phone columns', !/name|phone/i.test(header.join(',')));

    const trend = JSON.parse((await get('/analytics/trend?days=14', manager)).text);
    const registered = trend.rows.reduce((a, r) => a + r.registered, 0);
    check('CSV row count equals tokens in the trend chart', rows.length === registered,
      `csv ${rows.length}, trend ${registered}`);

    const blocked = await get('/analytics/export?days=14', clinician);
    check('Clinician is refused (403)', blocked.status === 403, `got ${blocked.status}`);

    const bad = await get('/analytics/export?from=banana', manager);
    check('Bad date is refused (400)', bad.status === 400, `got ${bad.status}`);

    // Does the export agree with the dashboard for the latest day with waits?
    const day = [...trend.rows].reverse().find((r) => r.avg_wait_minutes !== null);
    if (!day) {
      console.log('\nNo day with completed waits yet, so the dashboard comparison was skipped.');
    } else {
      const dayCsv = parseCsv((await get(`/analytics/export?from=${day.date}`, manager)).text).slice(1);
      const waitIdx = expected.indexOf('wait_minutes');
      const waits = dayCsv.map((r) => parseFloat(r[waitIdx])).filter((n) => !Number.isNaN(n));
      const csvAvg = waits.reduce((a, b) => a + b, 0) / waits.length;
      const dash = JSON.parse((await get(`/analytics/summary?date=${day.date}`, manager)).text);
      console.log(`\nDay ${day.date}: CSV average wait ${csvAvg.toFixed(2)} min, dashboard ${dash.avg_wait_minutes} min`);
      check('CSV average wait matches the dashboard (within 0.15 min)',
        Math.abs(csvAvg - parseFloat(dash.avg_wait_minutes)) <= 0.15);
    }

    console.log(`\n${passed} passed, ${failed} failed`);
  } catch (err) {
    console.log('Test could not run:', err.message);
  }
})();