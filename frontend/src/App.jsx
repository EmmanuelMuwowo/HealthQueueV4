import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login, { HOME_BY_ROLE } from './pages/Login';
import Reception from './pages/Reception';
import Clinic from './pages/Clinic';
import Manager from './pages/Manager';
import Display from './pages/Display';
import Appointments from './pages/Appointments';
import Settings from './pages/Settings';
import NetworkStatus from './components/NetworkStatus';

const getStaff = () => JSON.parse(sessionStorage.getItem('staff') || 'null');

// Only lets the listed roles in; everyone else is sent to their own screen
function Protected({ roles, children }) {
  const staff = getStaff();
  if (!staff || !sessionStorage.getItem('token')) return <Navigate to="/login" replace />;
  if (!roles.includes(staff.role)) {
    return <Navigate to={HOME_BY_ROLE[staff.role] || '/login'} replace />;
  }
  return children;
}

// Temporary screen: we replace each one in turn
function Placeholder({ title }) {
  const staff = getStaff();
  const signOut = () => {
    sessionStorage.clear();
    window.location.href = '/login';
  };
  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", sans-serif', padding: 40 }}>
      <h1>{title}</h1>
      <p>Signed in as <strong>{staff?.full_name}</strong> ({staff?.role})</p>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}

// Already signed in? Skip the login page and go to your own screen
function LoginRoute() {
  const staff = getStaff();
  const home = staff && HOME_BY_ROLE[staff.role];
  if (home && sessionStorage.getItem('token')) return <Navigate to={home} replace />;
  return <Login />;
}

function HomeRedirect() {
  const staff = getStaff();
  const home = staff && HOME_BY_ROLE[staff.role];
  if (home && sessionStorage.getItem('token')) return <Navigate to={home} replace />;
  return <Navigate to="/login" replace />;
}

function TestBanner() {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
      backgroundColor: '#FF9500', color: '#fff', textAlign: 'center',
      fontSize: 12, fontWeight: 700, padding: '5px 8px', letterSpacing: 0.5,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      TEST ENVIRONMENT: DO NOT USE REAL DATA
    </div>
  );
}

// Managers and admins get a small link to Settings, and back to analytics from there
function SettingsLink() {
  const { pathname } = useLocation();
  const staff = getStaff();
  if (!staff || !['manager', 'admin'].includes(staff.role) || pathname === '/display' || pathname === '/login') {
    return null;
  }
  const onSettings = pathname === '/settings';
  return (
    <Link to={onSettings ? '/manager' : '/settings'} style={{
      position: 'fixed', bottom: 36, left: 16, zIndex: 999,
      backgroundColor: '#1C1C1E', color: '#fff', textDecoration: 'none',
      fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    }}>
      {onSettings ? '← Analytics' : 'Settings'}
    </Link>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TestBanner />
      <NetworkStatus />
      <SettingsLink />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/reception" element={
          <Protected roles={['receptionist', 'admin']}>
            <Reception />
          </Protected>} />
        <Route path="/reception/appointments" element={
          <Protected roles={['receptionist', 'admin']}>
            <Appointments />
          </Protected>} />
        <Route path="/clinic" element={
          <Protected roles={['clinician', 'admin']}>
            <Clinic />
          </Protected>} />
        <Route path="/manager" element={
          <Protected roles={['manager', 'admin']}>
            <Manager />
          </Protected>} />
        <Route path="/settings" element={
          <Protected roles={['manager', 'admin']}>
            <Settings />
          </Protected>} />
        <Route path="/display" element={<Display />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}