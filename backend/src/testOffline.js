// Checks offline-sync behaviour: no duplicates, and the real arrival time is kept.
// Adds two fictional waiting patients (no phone numbers, so no SMS).
const BASE = 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};

const post = async (path, token, body) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

const secondsApart = (a, b) => Math.abs(new Date(a) - new Date(b)) / 1000;

(async () => {
  try {
    const login = await post('/auth/login', null, { username: 'reception1', password: 'Demo@1234' });
    if (login.status !== 200) throw new Error(`Login failed (HTTP ${login.status})`);
    const token = login.data.token;
    const stamp = Date.now() % 100000;

    // 1. A registration captured 5 minutes ago, sent now
    const ref = crypto.randomUUID();
    const captured = new Date(Date.now() - 5 * 60000).toISOString();
    const body = { full_name: `Offline Test A${stamp}`, service_point_id: 1, client_ref: ref, captured_at: captured };

    const first = await post('/visits', token, body);
    check('First sync creates a token (201)', first.status === 201, JSON.stringify(first.data));
    if (first.status !== 201) return;
    check('Arrival time is the capture time, not the sync time',
      secondsApart(first.data.token.arrival_time, captured) < 5,
      `arrival ${first.data.token.arrival_time}, captured ${captured}`);

    // 2. The same registration sent again (a retry after a dropped connection)
    const again = await post('/visits', token, body);
    check('Second send is not a new registration (200)', again.status === 200, `got ${again.status}`);
    check('Second send returns the same token', again.data?.token?.id === first.data.token.id,
      `${again.data?.token?.token_number} vs ${first.data.token.token_number}`);
    check('Second send is marked as replayed', again.data?.replayed === true);

    // 3. A malformed client_ref is refused
    const bad = await post('/visits', token, { ...body, client_ref: 'not-a-uuid' });
    check('Invalid client_ref is refused (400)', bad.status === 400, `got ${bad.status}`);

    // 4. A capture time in the future is ignored: server time is used instead
    const future = new Date(Date.now() + 60 * 60000).toISOString();
    const f = await post('/visits', token, {
      full_name: `Offline Test B${stamp}`, service_point_id: 1,
      client_ref: crypto.randomUUID(), captured_at: future,
    });
    check('Future capture time falls back to server time',
      f.status === 201 && secondsApart(f.data.token.arrival_time, new Date()) < 60,
      `arrival ${f.data?.token?.arrival_time}`);

    console.log(`\n${passed} passed, ${failed} failed`);
  } catch (err) {
    console.log('Test could not run:', err.message);
  }
})();