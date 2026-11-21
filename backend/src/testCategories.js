// Checks visit categories: list, default, validation, appointments and the clinician queue.
// Registers fictional patients without phone numbers, so no SMS is sent.
const BASE = 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};

const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

const login = async (username) => {
  const r = await call('POST', '/auth/login', null, { username, password: 'Demo@1234' });
  if (r.status !== 200) throw new Error(`Login failed for ${username} (HTTP ${r.status})`);
  return r.data.token;
};

(async () => {
  try {
    const reception = await login('reception1');
    const clinician = await login('clinician1');
    const stamp = Date.now() % 100000;

    // 1. The list: every active service point has visit types, with exactly one default each.
    // (Counts are not fixed: managers can add service points and visit types in Settings.)
    const list = await call('GET', '/visits/categories');
    check('Category list loads without login', list.status === 200 && Array.isArray(list.data));
    const cats = list.data || [];
    const active = (await call('GET', '/visits/service-points')).data || [];
    const activeIds = active.map((s) => s.id);
    check('Every active service point has visit types, and no inactive one appears',
      activeIds.every((id) => cats.some((c) => c.service_point_id === id))
        && cats.every((c) => activeIds.includes(c.service_point_id)),
      `active ${JSON.stringify(activeIds)}, listed ${JSON.stringify([...new Set(cats.map((c) => c.service_point_id))])}`);
    const sps = [...new Set(cats.map((c) => c.service_point_id))];
    check('Exactly one default per service point',
      sps.every((sp) => cats.filter((c) => c.service_point_id === sp && c.is_default).length === 1));

    const gopChronic = cats.find((c) => c.code === 'chronic');
    const phaDispensing = cats.find((c) => c.code === 'dispensing');

    // 2. Registration with a chosen category
    const a = await call('POST', '/visits', reception, {
      full_name: `Category Test A${stamp}`, service_point_id: 1, category_id: gopChronic.id,
    });
    check('Register with a category (201)', a.status === 201, JSON.stringify(a.data));
    check('The chosen category is stored', a.data?.category?.code === 'chronic',
      JSON.stringify(a.data?.category));

    // 3. Registration without a category gets the default
    const b = await call('POST', '/visits', reception, {
      full_name: `Category Test B${stamp}`, service_point_id: 1,
    });
    check('No category given: the default is used', b.data?.category?.code === 'new',
      JSON.stringify(b.data?.category));

    // 4. A category from another service point is refused
    const bad = await call('POST', '/visits', reception, {
      full_name: `Category Test C${stamp}`, service_point_id: 1, category_id: phaDispensing.id,
    });
    check('Category from another service point is refused (400)', bad.status === 400, `got ${bad.status}`);

    // 5. Appointment with a category, then check-in keeps it
    const later = new Date(Date.now() + 60 * 60000);
    const lusakaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });
    const laterDay = later.toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });
    if (laterDay !== lusakaToday) {
      console.log('SKIP  Appointment checks: run before 23:00 so the appointment is still today');
    } else {
      const appt = await call('POST', '/appointments', reception, {
        full_name: `Category Test D${stamp}`, service_point_id: 1,
        scheduled_at: later.toISOString(), category_id: gopChronic.id,
      });
      check('Book an appointment with a category (201)', appt.status === 201, JSON.stringify(appt.data));
      const listed = await call('GET', '/appointments', reception);
      const row = (listed.data || []).find((x) => x.id === appt.data?.appointment?.id);
      check('Appointment list shows the category name', row?.category_name === gopChronic.name,
        row?.category_name);
      const ci = await call('POST', `/appointments/${appt.data.appointment.id}/check-in`, reception);
      check('Check-in keeps the appointment category', ci.data?.category?.code === 'chronic',
        JSON.stringify(ci.data?.category));
    }

    // 6. The clinician sees the category in the queue
    const q = await call('GET', '/queue/1', clinician);
    const mine = (q.data?.waiting || []).find((t) => t.id === a.data?.token?.id);
    check('Clinician queue shows the category', mine?.category_name === gopChronic.name,
      mine?.category_name);

    // 7. The public display never shows it
    const pub = await call('GET', '/public/queue');
    check('Public display does not include categories',
      !JSON.stringify(pub.data || {}).includes(gopChronic.name));

    console.log(`\n${passed} passed, ${failed} failed`);
  } catch (err) {
    console.log('Test could not run:', err.message);
  }
})();