import { NavLink } from 'react-router-dom';

const cls = ({ isActive }) => (isActive ? 'is-active' : undefined);

// Walk-in / Appointments switch, styled as an Apple segmented control
export default function ReceptionNav() {
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 0' }}>
      <nav className="hq-segmented" aria-label="Reception">
        <NavLink to="/reception" end className={cls}>Walk-in</NavLink>
        <NavLink to="/reception/appointments" className={cls}>Appointments</NavLink>
      </nav>
    </div>
  );
}
