// HealthQueue evaluation run (automated)
// Plays receptionist and clinician through the real API, records its own times,
// then compares them with what the system stored.
//
// Run from the backend folder, with the server running (npm run dev):
//   node src/evalRun.js <receptionUsername> <receptionPassword> <clinicianUsername> <clinicianPassword>
// Quick practice run (about 8 minutes, results not valid):
//   set SCALE=0.05 then run the same command (PowerShell: $env:SCALE="0.05")
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');
 
const API = process.env.EVAL_API || 'http://localhost:5000/api';
const SCALE = parseFloat(process.env.SCALE || '1'); // 1 = real time
const MIN = 60000 * SCALE;
const [recUser, recPass, cliUser, cliPass] = process.argv.slice(2);
if (!cliPass) {
  console.log('Usage: node src/evalRun.js <receptionUser> <receptionPass> <clinicianUser> <clinicianPass>');
  process.exit(1);
}
 
// The run sheet: register at (minutes after start), visit type, planned consultation minutes
const PATIENTS = [
  { id: 'P01', name: 'Test Patient 01', phone: '0977000001', gender: 'male', type: /refill|follow-up/i, at: 0, plan: 6 },
  { id: 'P02', name: 'Test Patient 02', phone: '0977000002', gender: 'female', type: /new complaint/i, at: 0, plan: 14 },
  { id: 'P03', name: 'Test Patient 03', phone: '0977000003', gender: 'male', type: /refill|follow-up/i, at: 0, plan: 7 },
  { id: 'P04', name: 'Test Patient 04', phone: '0977000004', gender: 'female', type: /chronic/i, at: 5, plan: 35 },
  { id: 'P05', name: 'Test Patient 05', phone: '0977000005', gender: 'male', type: /new complaint/i, at: 10, plan: 11 },
  { id: 'P06', name: 'Test Patient 06', phone: '0977000006', gender: 'female', type: /refill|follow-up/i, at: 10, plan: 5 },
  { id: 'P07', name: 'Test Patient 07', phone: '0977000007', gender: 'male', type: /new complaint/i, at: 20, plan: 13 },
  { id: 'P08', name: 'Test Patient 08', phone: '0977000008', gender: 'female', type: /new complaint/i, at: 25, plan: 12, urgent: true },
  { id: 'P09', name: 'Test Patient 09', phone: '0977000009', gender: 'male', type: /chronic/i, at: 30, plan: 20 },
  { id: 'P10', name: 'Test Patient 10', phone: '0977000010', gender: 'female', type: /refill|follow-up/i, at: 30, plan: 8 },
];
const CALL_TO_START_MIN = 1;
 
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = (d) => d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka' });
const mins = (a, b) => (b - a) / 60000;
const r1 = (n) => Math.round(n * 10) / 10;
const log = (msg) => console.log(`${clock(new Date())}  ${msg}`);
 
async function call(method, url, token, body) {
  const res = await fetch(API + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${typeof data === 'object' ? JSON.stringify(data) : data}`);
  return data;
}
 
async function login(username, password) {
  const d = await call('POST', '/auth/login', null, { username, password });
  const token = d.token || d.accessToken || (d.data && d.data.token);
  if (!token) throw new Error('Login worked but no token was returned: ' + JSON.stringify(d).slice(0, 200));
  return token;
}
 
(async () => {
  console.log(`\nHealthQueue evaluation run · ${SCALE === 1 ? 'REAL TIME (about 2.5 hours)' : `PRACTICE (time x${SCALE}, results not valid)`}\n`);
  const recToken = await login(recUser, recPass);
  const cliToken = await login(cliUser, cliPass);
  log('Logged in as receptionist and clinician');
 
  const sps = await call('GET', '/visits/service-points', recToken);
  const gop = sps.find((s) => s.code === 'GOP');
  const cats = (await call('GET', '/visits/categories', recToken)).filter((c) => c.service_point_id === gop.id);
  for (const p of PATIENTS) {
    const c = cats.find((x) => p.type.test(x.name));
    if (!c) throw new Error(`No visit type matching ${p.type} at General Outpatient`);
    p.category_id = c.id; p.category = c.name;
  }
  const busy = await pool.query(
    `SELECT COUNT(*)::int AS n FROM queue_tokens WHERE service_point_id = $1 AND queue_date = CURRENT_DATE
     AND status IN ('waiting','called','in_consultation')`, [gop.id]);
  if (busy.rows[0].n > 0) {
    throw new Error(`General Outpatient already has ${busy.rows[0].n} active token(s). Run node src/resetDemo.js first.`);
  }
 
  const T0 = Date.now();
  const byToken = {};
  let registered = 0;
 
  // Reception: register each patient at their time
  const reception = (async () => {
    for (const p of PATIENTS) {
      const due = T0 + p.at * MIN;
      if (Date.now() < due) await sleep(due - Date.now());
      const sent = new Date();
      const res = await call('POST', '/visits', recToken, {
        full_name: p.name, phone_number: p.phone, gender: p.gender,
        service_point_id: gop.id, category_id: p.category_id,
        priority: p.urgent ? 'urgent' : 'normal',
      });
      p.arrived = sent;
      p.response_ms = Date.now() - sent.getTime();
      p.token_id = res.token.id;
      p.token = res.token.token_number;
      p.told = `${res.ewt.ewt_low}-${res.ewt.ewt_high}`;
      byToken[p.token] = p;
      registered += 1;
      log(`Registered ${p.id} as ${p.token} (${p.category}${p.urgent ? ', URGENT' : ''}) · told ${p.told} min · ${res.ewt.patients_ahead} ahead`);
    }
  })();
 
  // Clinician: call, start, complete, one patient at a time
  const clinician = (async () => {
    let served = 0;
    while (served < PATIENTS.length) {
      let tok;
      try {
        tok = await call('POST', `/queue/${gop.id}/call-next`, cliToken);
      } catch (e) {
        if (/404/.test(e.message)) { await sleep(Math.min(5000, MIN / 4)); continue; } // nobody waiting yet
        throw e;
      }
      const p = byToken[tok.token_number];
      if (!p) throw new Error(`Called an unknown token ${tok.token_number}. Was the queue reset?`);
      p.called = new Date();
      log(`Called ${p.token} (${p.id})`);
      await sleep(CALL_TO_START_MIN * MIN);
      p.started = new Date();
      await call('PUT', `/queue/tokens/${p.token_id}/start`, cliToken);
      log(`Started ${p.token} · consultation planned ${p.plan} min`);
      await sleep(p.plan * MIN);
      p.completed = new Date();
      await call('PUT', `/queue/tokens/${p.token_id}/complete`, cliToken);
      served += 1;
      log(`Completed ${p.token} · ${served}/${PATIENTS.length} done`);
    }
  })();
 
  await Promise.all([reception, clinician]);
 
  // Compare with what the system stored
  const db = await pool.query(
    `SELECT id, token_number, arrival_time, called_time, consultation_start, consultation_end,
            ewt_at_registration::float AS ewt, ewt_low, ewt_high
     FROM queue_tokens WHERE id = ANY($1)`, [PATIENTS.map((p) => p.token_id)]);
  const sys = Object.fromEntries(db.rows.map((r) => [r.id, r]));
 
  const lines = [];
  const out = (s = '') => { lines.push(s); console.log(s); };
  out('\n================ RESULTS ================');
  out(`Date: ${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lusaka' })}   Mode: ${SCALE === 1 ? 'real time' : `practice x${SCALE}`}`);
  out('\nTable A: per patient (times in Lusaka time, minutes rounded to 0.1)');
  out('Patient,Token,Visit type,Urgent,Planned min,Told range,Estimate min,Arrived,Called,Started,Completed,' +
      'System wait,Recorded wait,Difference,Within 2 min,Inside range,Estimate error');
  let within2 = 0, inside = 0, absErr = 0, err = 0, within5 = 0;
  for (const p of PATIENTS) {
    const s = sys[p.token_id];
    const sysWait = mins(new Date(s.arrival_time), new Date(s.consultation_start));
    const recWait = mins(p.arrived, p.started);
    const diff = sysWait - recWait;
    const ok2 = Math.abs(diff) <= 2;
    const ins = sysWait >= s.ewt_low && sysWait <= s.ewt_high;
    const e = sysWait - s.ewt;
    within2 += ok2; inside += ins; absErr += Math.abs(e); err += e; within5 += Math.abs(e) <= 5;
    p.result = { sysWait, recWait, diff, ok2, ins, e, ewt: s.ewt };
    out([p.id, p.token, p.category, p.urgent ? 'yes' : 'no', p.plan, p.told, r1(s.ewt),
      clock(p.arrived), clock(p.called), clock(p.started), clock(p.completed),
      r1(sysWait), r1(recWait), r1(diff), ok2 ? 'yes' : 'no', ins ? 'yes' : 'no', r1(e)].join(','));
  }
  const n = PATIENTS.length;
  out('\nTable B: analytics correctness (system wait vs independently recorded wait)');
  out(`Within +/-2 minutes: ${within2} of ${n} (${r1(within2 / n * 100)}%)  [criterion: at least 80%]`);
  out('\nTable C: estimate accuracy (actual wait vs estimate given at registration)');
  out(`Patients evaluated: ${n}`);
  out(`Mean absolute error: ${r1(absErr / n)} min`);
  out(`Mean error (positive = waited longer than told): ${r1(err / n)} min`);
  out(`Actual wait inside the range told: ${inside} of ${n} (${r1(inside / n * 100)}%)`);
  out(`Within 5 minutes of the estimate: ${within5} of ${n} (${r1(within5 / n * 100)}%)`);
  out('\nTable D: registration response time (API, from sending to token returned)');
  for (const p of PATIENTS) out(`${p.id}: ${p.response_ms} ms`);
  const sms = await pool.query(
    `SELECT kind, status, COUNT(*)::int AS n FROM sms_log WHERE token_id = ANY($1) GROUP BY kind, status ORDER BY kind, status`,
    [PATIENTS.map((p) => p.token_id)]);
  out('\nTable E: SMS log for these patients');
  for (const r of sms.rows) out(`${r.kind},${r.status},${r.n}`);
 
  const file = path.join(__dirname, '..', '..', 'docs', `evaluation-results-${SCALE === 1 ? 'real' : 'practice'}.txt`);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, lines.join('\n') + '\n'); out(`\nSaved to ${file}`); }
  catch (e) { out(`\nCould not save the file (${e.message}); copy the text above instead.`); }
  await pool.end();
})().catch(async (e) => {
  console.error('\nSTOPPED: ' + e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
