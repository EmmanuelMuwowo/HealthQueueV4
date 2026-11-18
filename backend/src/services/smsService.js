const pool = require('../db');
 
const apiUrl = () =>
  process.env.AT_USERNAME === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
 
// 0977123456 / 260977123456 / +260977123456  ->  +260977123456
const toE164 = (raw) => {
  if (!raw) return null;
  const digits = String(raw).replace(/[\s\-()]/g, '');
  if (/^\+260\d{9}$/.test(digits)) return digits;
  if (/^260\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+260${digits.slice(1)}`;
  return null;
};
 
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
 
// Retry waits in ms. The proposal specifies 30 s then 120 s.
// For rehearsals you can set SMS_RETRY_DELAYS_MS=2000,4000 in .env
const retryDelays = () =>
  (process.env.SMS_RETRY_DELAYS_MS || '30000,120000')
    .split(',')
    .map((n) => parseInt(n.trim()))
    .filter((n) => n > 0);
 
// retryable = true only for problems that may fix themselves
const sendSms = async (rawPhone, message) => {
  const to = toE164(rawPhone);
  if (!to) return { ok: false, retryable: false, error: 'Missing or invalid phone number' };
  if (!process.env.AT_USERNAME || !process.env.AT_API_KEY) {
    return { ok: false, retryable: false, to, error: 'AT_USERNAME / AT_API_KEY not set in .env' };
  }
  try {
    const res = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        apiKey: process.env.AT_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ username: process.env.AT_USERNAME, to, message }),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok || !data) {
      return {
        ok: false,
        to,
        retryable: res.status >= 500 || res.status === 429,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const recipient = data.SMSMessageData?.Recipients?.[0];
    const ok = recipient?.status === 'Success' || recipient?.statusCode === 101;
    return {
      ok,
      to,
      retryable: false,
      status: recipient?.status,
      message_id: recipient?.messageId || null,
      error: ok ? null : (recipient?.status || 'Rejected by gateway'),
    };
  } catch (err) {
    // Network failure (DNS, reset, timeout): worth another try
    return { ok: false, to, retryable: true, error: err.message };
  }
};
 
// Wait as a range, e.g. "15-30 min". Plain hyphen on purpose: an en dash is not in
// the GSM-7 alphabet and would force the whole SMS into UCS-2 (70 chars per part).
// Falls back to the single estimate if no range is available.
const waitText = ({ ewt_minutes, ewt_low, ewt_high }) =>
  ewt_low != null && ewt_high != null
    ? `${ewt_low}-${ewt_high} min`
    : `about ${ewt_minutes} min`;
 
// Messages carry the token and wait time only. No patient name.
const registrationMessage = ({ token_number, service_point, patients_ahead, ...ewt }) =>
  `HealthQueue: Your token is ${token_number} (${service_point}). ` +
  (patients_ahead === 0
    ? 'You are next. '
    : `${patients_ahead} ahead, wait ${waitText(ewt)}. `) +
  'We will text you when it is your turn.';
 
const calledMessage = ({ token_number, service_point }) =>
  `HealthQueue: ${token_number}, it is your turn. Please go to ${service_point} now.`;

// Sent once, when the patient is near the front of the queue
const almostNextMessage = ({ token_number, service_point }) =>
  `HealthQueue: ${token_number}, you are almost next at ${service_point}. Please return to the waiting area now.`;
 
// Sends (or logs) a message and records the outcome in sms_log.
// Never throws, so an SMS problem can never stop a patient from getting a token.
const deliver = async ({ tokenId, appointmentId, kind, phone, message }) => {
  const mode = process.env.SMS_MODE === 'log' ? 'log' : 'api';
  const to = toE164(phone);
  let status;
  let error = null;
  let attempts = 1;
 
  try {
    if (!to) {
      status = 'failed';
      error = 'Missing or invalid phone number';
    } else if (mode === 'log') {
      status = 'logged';
      console.log(`[SMS log] to ${to}: ${message}`);
    } else {
      const delays = retryDelays();
      let result;
      for (let i = 0; i <= delays.length; i++) {
        attempts = i + 1;
        result = await sendSms(phone, message);
        if (result.ok || !result.retryable || i === delays.length) break;
        console.log(`SMS attempt ${attempts} failed (${result.error}). Retrying in ${delays[i] / 1000}s`);
        await sleep(delays[i]);
      }
      status = result.ok ? 'sent' : 'failed';
      error = result.ok ? null : (result.error || 'Unknown error');
    }
  } catch (err) {
    status = 'failed';
    error = err.message;
  }
 
  try {
    await pool.query(
      `INSERT INTO sms_log (token_id, appointment_id, kind, to_number, message, mode, status, error, attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tokenId || null, appointmentId || null, kind, to, message, mode, status, error, attempts]
    );
  } catch (err) {
    console.error('sms_log insert failed:', err.message);
  }
  return { status, error, to, attempts };
};
 
module.exports = {
  sendSms, deliver, toE164, waitText, registrationMessage, calledMessage, almostNextMessage,
};