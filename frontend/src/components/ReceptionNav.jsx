import { NavLink } from 'react-router-dom';

const link = ({ isActive }) => ({
  padding: '8px 18px', borderRadius: 20, fontSize: 14, fontWeight: 600, textDecoration: 'none',
  backgroundColor: isActive ? '#007AFF' : '#fff', color: isActive ? '#fff' : '#1C1C1E',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export default function ReceptionNav() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 20px 0', display: 'flex', gap: 10 }}>
      <NavLink to="/reception" end style={link}>Walk-in</NavLink>
      <NavLink to="/reception/appointments" style={link}>Appointments</NavLink>
    </div>
  );
}