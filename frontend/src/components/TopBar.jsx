export default function TopBar({ subtitle }) {
  const staff = JSON.parse(sessionStorage.getItem('staff') || '{}');

  const signOut = () => {
    sessionStorage.clear();
    window.location.href = '/login';
  };

  return (
    <div style={{
      backgroundColor: '#fff', borderBottom: '1px solid #E5E5EA', padding: '14px 32px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, backgroundColor: '#007AFF', borderRadius: 9, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
        }}>H</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E' }}>HealthQueue</div>
          <div style={{ fontSize: 12, color: '#8E8E93' }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 14, color: '#8E8E93' }}>
          {staff.full_name} · {staff.role}
        </span>
        <button onClick={signOut} style={{
          padding: '7px 16px', backgroundColor: '#FFF2F2', color: '#FF3B30', border: 'none',
          borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}>Sign out</button>
      </div>
    </div>
  );
}