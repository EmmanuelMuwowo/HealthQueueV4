// Limits repeated failed logins (security requirement SR3).
// After MAX_PER_ACCOUNT failed attempts for one username within WINDOW, that account
// is blocked for the rest of the window. A wider limit per computer (IP address) stops
// someone trying many usernames. A successful login clears the account's count.
// Kept in memory: restarting the server clears it, which is acceptable for one clinic server.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5');
const MAX_PER_IP = parseInt(process.env.LOGIN_MAX_ATTEMPTS_PER_IP || '20');

const failures = new Map(); // key -> array of failure times

const recent = (key, now) => {
  const list = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list); else failures.delete(key);
  return list;
};

const loginLimiter = (req, res, next) => {
  const now = Date.now();
  const user = `u:${String(req.body?.username || '').trim().toLowerCase()}`;
  const ip = `ip:${req.ip}`;
  const userFails = recent(user, now);
  const ipFails = recent(ip, now);

  if (userFails.length >= MAX_PER_ACCOUNT || ipFails.length >= MAX_PER_IP) {
    const oldest = Math.min(...(userFails.length >= MAX_PER_ACCOUNT ? userFails : ipFails));
    const minutes = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 60000));
    return res.status(429).json({
      error: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }

  // Record the outcome once the login controller has answered
  res.on('finish', () => {
    if (res.statusCode === 401) {
      [user, ip].forEach((k) => failures.set(k, [...recent(k, Date.now()), Date.now()]));
    } else if (res.statusCode === 200) {
      failures.delete(user);
    }
  });
  next();
};

module.exports = { loginLimiter };
