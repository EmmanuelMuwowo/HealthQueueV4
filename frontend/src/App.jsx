import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login, { HOME_BY_ROLE } from './pages/Login';
import Reception from './pages/Reception';
import Clinic from './pages/Clinic';
import Manager from './pages/Manager';
import Display from './pages/Display';
import Appointments from './pages/Appointments';

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
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
        <Route path="/reception/appointments" element={
  <Protected roles={['receptionist', 'admin']}>
    <Appointments />
  </Protected>} />  
        <Route path="/display" element={<Display />} />  
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}