const BASE = 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};

const call = async (path, token) => {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
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

const time = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka' });

(async () => {
  try {
    const manager = await login('manager1');
    const clinician = await login('clinician1');
    const date = process.argv[2] || '';
    const q = date ? `?date=${date}` : '';

    const list = await call(`/analytics/tokens${q}`, manager);
    check('Token list loads', list.status === 200 && Array.isArray(list.data), JSON.stringify(list.data));

    const done = (list.data || []).filter((t) => t.status === 'completed');
    if (done.length === 0) {
      console.log('\nNo completed token found. Complete one patient first,');
      console.log('or pass a date that has one: node src/testTimeline.js 2026-10-15');
      return;
    }

    const t = done[done.length - 1];
    const r = await call(`/analytics/tokens/${t.id}/timeline`, manager);
    check('Timeline loads', r.status === 200, JSON.stringify(r.data));
    if (r.status !== 200) return;

    console.log(`\nTimeline for ${r.data.token.token_number} (${r.data.token.service_point})`);
    for (const e of r.data.events) {
      console.log(`  ${time(e.event_time)}  ${e.event_type}  (${e.actor || 'system'})`);
    }
    console.log('Intervals:', r.data.intervals, '\n');

    const types = r.data.events.map((e) => e.event_type);
    for (const need of ['arrived', 'called', 'consultation_started', 'completed']) {
      check(`Event log has "${need}"`, types.includes(need));
    }

    const i = r.data.intervals;
    check('Total wait is a number', typeof i.total_wait_minutes === 'number');
    check(
      'Total wait = wait until called + call to start (within 0.2 min)',
      Math.abs(i.total_wait_minutes - (i.wait_until_called_minutes + i.call_to_start_minutes)) <= 0.2
    );

    const blocked = await call(`/analytics/tokens/${t.id}/timeline`, clinician);
    check('Clinician is refused (403)', blocked.status === 403, `got ${blocked.status}`);

    console.log(`\n${passed} passed, ${failed} failed`);
  } catch (err) {
    console.log('Test could not run:', err.message);
  }
})();