import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import ChangePassword from './ChangePassword';

const ROLE_NAMES = {
  receptionist: 'Receptionist',
  clinician: 'Clinician',
  manager: 'Clinic manager',
  admin: 'Administrator',
};

// The screens each role can open, shown as links in the bar
const LINKS_BY_ROLE = {
  manager: [['/manager', 'Analytics'], ['/settings', 'Settings']],
  admin: [['/reception', 'Reception'], ['/clinic', 'Clinic'], ['/manager', 'Analytics'], ['/settings', 'Settings'], ['/display', 'Display']],
};

export default function TopBar({ subtitle }) {
  const staff = JSON.parse(sessionStorage.getItem('staff') || '{}');
  const links = LINKS_BY_ROLE[staff.role] || [];
  const [changing, setChanging] = useState(false);

  const signOut = () => {
    sessionStorage.clear();
    window.location.href = '/login';
  };

  return (
    <header className="hq-topbar">
      <div className="hq-topbar-inner">
        <div className="hq-brand">
          <div className="hq-brand-mark" aria-hidden="true">H</div>
          <div>
            <div className="hq-brand-name">HealthQueue</div>
            {subtitle && <div className="hq-brand-sub">{subtitle}</div>}
          </div>
        </div>

        {links.length > 0 && (
          <nav className="hq-nav" aria-label="Screens">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                {label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="hq-user">
          <div>
            <div className="hq-user-name">{staff.full_name}</div>
            <div className="hq-user-role">{ROLE_NAMES[staff.role] || staff.role}</div>
          </div>
          <button type="button" className="hq-btn hq-btn-plain" style={{ fontSize: 14 }} onClick={() => setChanging(true)}>
            Change password
          </button>
          <button type="button" className="hq-btn hq-btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </div>
      {changing && <ChangePassword onClose={() => setChanging(false)} />}
    </header>
  );
}
