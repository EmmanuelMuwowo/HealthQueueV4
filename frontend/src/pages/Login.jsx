import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

export const HOME_BY_ROLE = {
  receptionist: '/reception',
  clinician: '/clinic',
  manager: '/manager',
  admin: '/manager',
};

const S = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 16px 64px' },
  wrap: { width: '100%', maxWidth: 380, textAlign: 'center' },
  mark: {
    width: 64, height: 64, margin: '0 auto 20px', borderRadius: 16, background: 'var(--hq-blue)',
    color: '#fff', display: 'grid', placeItems: 'center', fontSize: 30, fontWeight: 700,
    boxShadow: '0 8px 24px rgba(0, 122, 255, 0.25)',
  },
  group: { textAlign: 'left', margin: '28px 0 16px' },
  groupInput: {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: 16, padding: '14px 16px', minHeight: 50,
  },
  footer: { marginTop: 28 },
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!username || !password) {
      setError('Enter your username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username, password });
      sessionStorage.setItem('token', res.data.token);
      sessionStorage.setItem('staff', JSON.stringify(res.data.staff));
      navigate(HOME_BY_ROLE[res.data.staff.role] || '/login');
    } catch (err) {
      setError(
        err.response?.status === 401
          ? 'Incorrect username or password.'
          : 'Cannot reach the server. Check that the backend is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={S.mark} aria-hidden="true">H</div>
        <h1 className="hq-large-title">Sign in to HealthQueue</h1>
        <p className="hq-footnote" style={{ margin: '8px 0 0' }}>Kalingalinga Clinic staff</p>

        <form onSubmit={handleLogin} noValidate>
          <div className="hq-group" style={S.group}>
            <div className="hq-row" style={{ padding: 0 }}>
              <input style={S.groupInput} value={username} placeholder="Username" aria-label="Username"
                autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="hq-row" style={{ padding: 0 }}>
              <input style={S.groupInput} type="password" value={password} placeholder="Password"
                aria-label="Password" autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>

          {error && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 16, textAlign: 'left' }}>{error}</div>}

          <button type="submit" className="hq-btn hq-btn-primary hq-btn-large" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="hq-footnote" style={S.footer}>
          Patients don’t need an account.{' '}
          <Link to="/display" style={{ color: 'var(--hq-blue)', textDecoration: 'none', fontWeight: 500 }}>
            Open the waiting-room display
          </Link>
        </div>
      </div>
    </main>
  );
}
