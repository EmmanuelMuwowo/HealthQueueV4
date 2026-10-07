import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export const HOME_BY_ROLE = {
  receptionist: '/reception',
  clinician: '/clinic',
  manager: '/manager',
  admin: '/manager',
};

const S = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F2F2F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: '40px 36px', width: '100%',
    maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', boxSizing: 'border-box',
  },
  logo: {
    width: 52, height: 52, backgroundColor: '#007AFF', borderRadius: 14, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 24, marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: 700, color: '#1C1C1E', margin: '0 0 4px' },
  sub: { fontSize: 14, color: '#8E8E93', margin: '0 0 28px' },
  label: { fontSize: 13, fontWeight: 500, color: '#3C3C43', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E5EA',
    fontSize: 15, backgroundColor: '#FAFAFA', boxSizing: 'border-box', outline: 'none', marginBottom: 14,
  },
  btn: {
    width: '100%', padding: 14, backgroundColor: '#007AFF', color: '#fff', border: 'none',
    borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8,
  },
  error: {
    color: '#FF3B30', fontSize: 13, backgroundColor: '#FFF2F2',
    padding: '10px 12px', borderRadius: 8, marginBottom: 14,
  },
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Enter your username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('staff', JSON.stringify(res.data.staff));
      navigate(HOME_BY_ROLE[res.data.staff.role] || '/login');
    } catch (err) {
      setError(
        err.response?.status === 401
          ? 'Incorrect username or password.'
          : 'Cannot reach the server. Is the backend running?'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>H</div>
        <h1 style={S.title}>Staff Login</h1>
        <p style={S.sub}>HealthQueue · Kalingalinga Urban Health Centre</p>
        {error && <div style={S.error}>{error}</div>}
        <label style={S.label}>Username</label>
        <input style={S.input} value={username} placeholder="Enter username"
          onChange={(e) => setUsername(e.target.value)} />
        <label style={S.label}>Password</label>
        <input style={S.input} type="password" value={password} placeholder="Enter password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
        <button style={S.btn} onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}