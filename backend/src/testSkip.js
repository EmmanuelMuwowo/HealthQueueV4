// Checks skip and re-queue end to end. Registers 3 fictional patients (no phone
// numbers, so no SMS is sent) and takes them through skip and re-queue.
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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

    const before = await call('GET', '/queue/1', clinician);
    if (before.data.now_serving) {
      console.log(
        `Stop: ${before.data.now_serving.token_number} is still ${before.data.now_serving.status}. ` +
        'Complete that patient on the clinic screen, then run this again.'
      );
      return;
    }

    // Three fictional patients in General Outpatient
    const stamp = Date.now() % 100000;
    for (const label of ['A', 'B', 'C']) {
      const r = await call('POST', '/visits', reception, {
        full_name: `Skip Test ${label}${stamp}`,
        service_point_id: 1,
      });
      check(`Register Skip Test ${label}`, r.status === 201, JSON.stringify(r.data));
    }

    // 1. Call next
    const c1 = await call('POST', '/queue/1/call-next', clinician);
    check('Call next -> called', c1.status === 200 && c1.data?.status === 'called', JSON.stringify(c1.data));
    const firstId = c1.data.id;

    // 2. Skip the called patient
    const s = await call('PUT', `/queue/tokens/${firstId}/skip`, clinician);
    check('Skip the called patient', s.status === 200 && s.data?.status === 'skipped', JSON.stringify(s.data));

    // 3. The queue is not stuck
    const c2 = await call('POST', '/queue/1/call-next', clinician);
    check('Call next works again after a skip', c2.status === 200 && c2.data?.id !== firstId, JSON.stringify(c2.data));
    const secondId = c2.data.id;

    // 4. The skipped patient appears in the skipped list
    const q1 = await call('GET', '/queue/1', clinician);
    check('Skipped list contains the skipped token', (q1.data.skipped || []).some((t) => t.id === firstId));

    // 5. Re-queue
    const r = await call('PUT', `/queue/tokens/${firstId}/requeue`, clinician);
    check('Re-queue -> waiting', r.status === 200 && r.data?.status === 'waiting', JSON.stringify(r.data));

    // 6. Back of the queue
    const q2 = await call('GET', '/queue/1', clinician);
    const waiting = q2.data.waiting || [];
    const last = waiting[waiting.length - 1];
    check('Re-queued patient is last in waiting', last && last.id === firstId, `last was ${last?.token_number}`);
    check('Re-queued token left the skipped list', !(q2.data.skipped || []).some((t) => t.id === firstId));

    // 7. Rule: only a called patient can be skipped
    const bad = await call('PUT', `/queue/tokens/${waiting[0].id}/skip`, clinician);
    check('Skipping a waiting patient is refused (409)', bad.status === 409, `got ${bad.status}`);

    // Tidy up: finish the patient called in step 3 so the queue is not left stuck
    await call('PUT', `/queue/tokens/${secondId}/start`, clinician);
    await call('PUT', `/queue/tokens/${secondId}/complete`, clinician);

    console.log(`\n${passed} passed, ${failed} failed`);
  } catch (err) {
    console.log('Test could not run:', err.message);
  }
})();