import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Automatic sign-out after a period without activity (security requirement SR5).
// Reception tablets are shared, so the receptionist limit is short. Clinicians often
// sit through a long consultation without touching the screen, so theirs is longer.
const MINUTES_BY_ROLE = { receptionist: 15, clinician: 60, manager: 30, admin: 30 };
const WARN_SECONDS = 60;
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

export default function IdleSignOut() {
  const { pathname } = useLocation();
  const [secondsLeft, setSecondsLeft] = useState(null);
  const lastActive = useRef(Date.now());

  const staff = JSON.parse(sessionStorage.getItem('staff') || 'null');
  const signedIn = Boolean(staff && sessionStorage.getItem('token'));
  const active = signedIn && pathname !== '/login' && pathname !== '/display';
  const limitMs = (MINUTES_BY_ROLE[staff?.role] || 15) * 60000;

  useEffect(() => {
    if (!active) return undefined;
    lastActive.current = Date.now();
    const touch = () => { lastActive.current = Date.now(); };
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      const left = Math.ceil((limitMs - (Date.now() - lastActive.current)) / 1000);
      if (left <= 0) {
        sessionStorage.clear();
        window.location.href = '/login?reason=idle';
      } else {
        setSecondsLeft(left <= WARN_SECONDS ? left : null);
      }
    }, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
    };
  }, [active, limitMs]);

  if (!active || secondsLeft === null) return null;
  return (
    <div className="hq-offline-banner" role="alert" style={{ top: 'auto', bottom: 44, gap: 14 }}>
      You will be signed out in {secondsLeft} s because the screen has not been used.
      <button type="button" className="hq-btn hq-btn-primary" style={{ minHeight: 30, padding: '4px 12px', fontSize: 13 }}
        onClick={() => { lastActive.current = Date.now(); setSecondsLeft(null); }}>
        Stay signed in
      </button>
    </div>
  );
}
