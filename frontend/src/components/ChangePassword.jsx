import { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';

// Change your own password (security requirement SR2). The same rule is checked
// on the server; checking it here too gives an immediate message.
const problem = (pw, username) => {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use both letters and numbers.';
  if (username && pw.toLowerCase() === username.toLowerCase()) return 'The password cannot be the same as the username.';
  return null;
};

export default function ChangePassword({ onClose }) {
  const staff = JSON.parse(sessionStorage.getItem('staff') || '{}');
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const p = problem(form.next, staff.username);
    if (p) return setError(p);
    if (form.next !== form.again) return setError('The two new passwords do not match.');
    setBusy(true); setError('');
    try {
      await api.post('/auth/change-password', { current_password: form.current, new_password: form.next });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change the password. Check the connection.');
    } finally {
      setBusy(false);
    }
  };

  // Rendered at the end of the page so it covers the whole screen, not just the top bar
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="cp-title" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="hq-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}
        style={{ width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h2 id="cp-title" className="hq-title" style={{ marginBottom: 4 }}>Change password</h2>
        <p className="hq-footnote" style={{ margin: '0 0 16px' }}>At least 8 characters, with letters and numbers.</p>
        {done ? (
          <>
            <div className="hq-notice is-success" role="status">Password changed. Use the new password next time you sign in.</div>
            <button type="button" className="hq-btn hq-btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            {error && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
            <div className="hq-field">
              <label htmlFor="cp-cur">Current password</label>
              <input id="cp-cur" className="hq-input" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} autoFocus />
            </div>
            <div className="hq-field">
              <label htmlFor="cp-new">New password</label>
              <input id="cp-new" className="hq-input" type="password" autoComplete="new-password" value={form.next} onChange={set('next')} />
            </div>
            <div className="hq-field">
              <label htmlFor="cp-again">New password again</label>
              <input id="cp-again" className="hq-input" type="password" autoComplete="new-password" value={form.again} onChange={set('again')} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" className="hq-btn hq-btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button type="submit" className="hq-btn hq-btn-primary" style={{ flex: 1 }} disabled={busy || !form.current || !form.next}>
                {busy ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body
  );
}
