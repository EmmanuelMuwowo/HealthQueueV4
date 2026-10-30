// Checks phone validation, patient search, and new vs returning patients.
// Registers one fictional patient twice (General Outpatient, then Pharmacy).
// Their phone number is fictional, so in api mode the sandbox accepts an SMS.
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
    const name = `Phone Test ${stamp}`;
    // Unique fictional number for each run
    const local = `09770${String(stamp).padStart(5, '0')}`;
    const international = `+260 ${local.slice(1, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;

    // 1. Invalid phone numbers are refused
    const bad1 = await call('POST', '/visits', reception, { full_name: name, phone_number: '12345', service_point_id: 1 });
    check('Too-short phone number is refused (400)', bad1.status === 400, `got ${bad1.status}`);
    const bad2 = await call('POST', '/visits', reception, { full_name: name, phone_number: '0911234567', service_point_id: 1 });
    check('Unknown network prefix is refused (400)', bad2.status === 400, `got ${bad2.status}`);

    // 2. An international format is accepted and stored in the standard form
    const first = await call('POST', '/visits', reception, {
      full_name: name, phone_number: international, service_point_id: 1,
    });
    check('International format is accepted (201)', first.status === 201, JSON.stringify(first.data));
    if (first.status !== 201) return;
    check('Phone is stored as 0977... form', first.data.patient.phone_number === local,
      `stored ${first.data.patient.phone_number}`);
    check('First visit is marked "new"', first.data.patient_history?.status === 'new',
      JSON.stringify(first.data.patient_history));

    // 3. Search finds the patient by phone (any format) and by name
    const byPhone = await call('GET', `/patients/search?q=${encodeURIComponent(local)}`, reception);
    check('Search by phone finds the patient', (byPhone.data || []).some((p) => p.id === first.data.patient.id));
    const byIntl = await call('GET', `/patients/search?q=${encodeURIComponent('260' + local.slice(1))}`, reception);
    check('Search by +260 form finds the patient', (byIntl.data || []).some((p) => p.id === first.data.patient.id));
    const byName = await call('GET', `/patients/search?q=${encodeURIComponent(`Test ${stamp}`)}`, reception);
    check('Search by part of the name finds the patient', (byName.data || []).some((p) => p.id === first.data.patient.id));
    const tooShort = await call('GET', '/patients/search?q=ab', reception);
    check('Search needs at least 3 characters', Array.isArray(tooShort.data) && tooShort.data.length === 0);

    // 4. Registering the same patient again, chosen from search, marks them "returning"
    const again = await call('POST', '/visits', reception, {
      patient_id: first.data.patient.id, full_name: name, service_point_id: 4,
    });
    check('Second visit is marked "returning"',
      again.status === 201 && again.data.patient_history?.status === 'returning'
        && again.data.patient_history.previous_visits === 1,
      JSON.stringify(again.data?.patient_history || again.data));

    // 5. Only reception can search patients
    const blocked = await call('GET', `/patients/search?q=${encodeURIComponent(local)}`, clinician);
    check('Clinician cannot search patients (403)', blocked.status === 403, `got ${blocked.status}`);

    console.log(`\n${passed} passed, ${failed} failed`);
  } catch (err) {
    console.log('Test could not run:', err.message);
  }
})();