import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login, { HOME_BY_ROLE } from './pages/Login';
import Reception from './pages/Reception';
import Clinic from './pages/Clinic';
import Manager from './pages/Manager';
import Display from './pages/Display';

const getStaff = () => JSON.parse(localStorage.getItem('staff') || 'null');

// Only lets the listed roles in; everyone else is sent to their own screen
function Protected({ roles, children }) {
  const staff = getStaff();
  if (!staff || !localStorage.getItem('token')) return <Navigate to="/login" replace />;
  if (!roles.includes(staff.role)) {
    return <Navigate to={HOME_BY_ROLE[staff.role] || '/login'} replace />;
  }
  return children;
}

// Temporary screen: we replace each one in turn
function Placeholder({ title }) {
  const staff = getStaff();
  const signOut = () => {
    localStorage.clear();
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reception" element={
          <Protected roles={['receptionist', 'admin']}>
            <Reception />
          </Protected>} />
        <Route path="/clinic" element={
          <Protected roles={['clinician', 'admin']}>
            <Clinic />
          </Protected>} />
        <Route path="/manager" element={
          <Protected roles={['manager', 'admin']}>
            <Manager />
          </Protected>} />
        <Route path="/display" element={<Display />} />  
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}