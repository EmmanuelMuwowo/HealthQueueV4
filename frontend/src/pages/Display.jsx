import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

// Optional room names, shown next to a called token.
// Add one line per department, using the exact service point name, for example:
//   'General Outpatient': 'Consultation Room 2',
const ROOMS = {};

// A small accent colour per department (dot and top rule only); anything else uses blue
const ACCENTS = [
  { match: /outpatient/i, color: '#007AFF' },
  { match: /antenatal|anc/i, color: '#AF52DE' },
  { match: /under.?5|child/i, color: '#FF9500' },
  { match: /pharmacy/i, color: '#34C759' },
];
const accentFor = (name) => (ACCENTS.find((a) => a.match.test(name)) || ACCENTS[0]).color;

// How many waiting tokens fit under each department, by screen height
const rowsForScreen = () => (window.innerHeight >= 1000 ? 5 : window.innerHeight >= 880 ? 4 : window.innerHeight >= 800 ? 3 : 2);

const CSS = `
.dsp { height: 100vh; min-height: 640px; display: grid; grid-template-rows: auto auto 1fr auto; background: #F5F5F7; color: #1D1D1F; overflow: hidden; }
.dsp-head { display: flex; align-items: center; gap: 18px; padding: 26px 56px 22px; }
.dsp-mark { width: 48px; height: 48px; border-radius: 12px; background: #007AFF; display: grid; place-items: center; flex: none; }
.dsp-name { font-family: var(--hq-font-display); font-size: 32px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.dsp-status { display: flex; align-items: center; gap: 8px; font-size: 17px; color: #6E6E73; margin-left: 20px; }
.dsp-status i { width: 9px; height: 9px; border-radius: 50%; background: #34C759; }
.dsp-status.is-off i { background: #AEAEB2; }
.dsp-clock { margin-left: auto; text-align: right; }
.dsp-time { font-family: var(--hq-font-display); font-size: 40px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.dsp-date { font-size: 16px; color: #6E6E73; margin-top: 4px; }

/* Now calling: the one bold element on the screen */
.dsp-calling { margin: 0 56px; border-radius: 28px; background: #007AFF; color: #fff; padding: 26px 40px 30px; display: grid; grid-template-columns: auto 1fr; gap: 8px 48px; align-items: end; min-height: 210px; }
.dsp-calling-label { grid-column: 1 / -1; font-size: 22px; font-weight: 600; opacity: 0.9; }
.dsp-main-token { font-family: var(--hq-font-display); font-size: clamp(96px, 11vw, 190px); font-weight: 700; line-height: 0.95; letter-spacing: -0.035em; white-space: nowrap; }
.dsp-main-where { font-size: clamp(22px, 2vw, 34px); font-weight: 600; margin-top: 10px; display: flex; align-items: center; gap: 12px; }
.dsp-earlier { align-self: stretch; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px; border-left: 1px solid rgba(255,255,255,0.3); padding-left: 40px; }
.dsp-earlier-label { font-size: 17px; opacity: 0.75; }
.dsp-earlier-row { display: flex; align-items: baseline; gap: 16px; }
.dsp-earlier-token { font-family: var(--hq-font-display); font-size: 44px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; }
.dsp-earlier-where { font-size: 19px; opacity: 0.85; }
.dsp-calling.is-idle { background: #fff; color: #1D1D1F; grid-template-columns: 1fr; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.dsp-idle-text { font-family: var(--hq-font-display); font-size: 48px; font-weight: 700; letter-spacing: -0.02em; }
.dsp-idle-sub { font-size: 22px; color: #6E6E73; margin-top: 8px; }
.dsp-fresh { animation: dsp-in 600ms cubic-bezier(.2,.8,.2,1); }
@keyframes dsp-in { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }

/* Department board */
.dsp-board { margin: 24px 56px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; min-height: 0; }
.dsp-col { background: #fff; border-radius: 22px; padding: 22px 26px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04); border-top: 5px solid var(--accent); }
.dsp-col-head { display: flex; flex-direction: column; gap: 2px; }
.dsp-col-name { font-family: var(--hq-font-display); font-size: 25px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsp-col-count { font-size: 17px; color: #6E6E73; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsp-serving { white-space: nowrap; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 14px; padding: 12px 16px; background: #F5F5F7; border-radius: 12px; font-size: 17px; color: #6E6E73; }
.dsp-serving b { font-size: 22px; color: #1D1D1F; font-weight: 700; white-space: nowrap; }
.dsp-list { margin-top: 10px; }
.dsp-row { display: flex; align-items: baseline; gap: 12px; padding: 10px 2px; border-bottom: 1px solid rgba(60,60,67,0.12); }
.dsp-row:last-child { border-bottom: none; }
.dsp-row-token { font-family: var(--hq-font-display); font-size: 30px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
.dsp-row-wait { margin-left: auto; font-size: 19px; color: #6E6E73; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsp-urgent { font-size: 14px; font-weight: 700; color: #D70015; background: rgba(255,59,48,0.1); border-radius: 999px; padding: 2px 9px; align-self: center; }
.dsp-more { margin-top: 10px; font-size: 17px; color: #6E6E73; }
.dsp-empty { margin: auto 0; padding: 24px 0; text-align: center; font-size: 20px; color: #6E6E73; }

.dsp-foot { display: flex; align-items: center; gap: 16px; padding: 18px 56px 40px; font-size: 19px; color: #6E6E73; }
.dsp-sound { margin-left: auto; display: flex; align-items: center; gap: 8px; border: none; background: #fff; border-radius: 999px; padding: 9px 18px; font-size: 16px; font-weight: 600; color: #007AFF; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

@media (max-width: 1500px) {
  .dsp-head, .dsp-foot { padding-left: 32px; padding-right: 32px; }
  .dsp-calling, .dsp-board { margin-left: 32px; margin-right: 32px; }
  .dsp-calling { min-height: 150px; padding: 20px 32px 24px; }
  .dsp-main-token { font-size: clamp(72px, 8vw, 150px); }
  .dsp-board { margin-top: 18px; gap: 16px; }
  .dsp-col { padding: 18px 20px; }
  .dsp-serving { font-size: 15px; padding: 10px 12px; }
  .dsp-serving b { font-size: 19px; }
  .dsp-row-wait { font-size: 16px; }
  .dsp-earlier-token { font-size: 34px; }
  .dsp-row-token { font-size: 25px; }
  .dsp-col-name { font-size: 21px; }
}
@media (max-width: 900px) {
  .dsp { height: auto; overflow: visible; }
  .dsp-calling { grid-template-columns: 1fr; }
  .dsp-earlier { border-left: none; padding-left: 0; }
}
`;

// A soft two-note chime, made in the browser so no sound file is needed
function chime(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  [[880, 0], [660, 0.32]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + at);
    gain.gain.linearRampToValueAtTime(0.25, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 1);
  });
}

// Spoken announcement, using the browser's built-in voice (no internet or extra software needed)
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const sayToken = (token) =>
  token.split('').map((ch) => (/[0-9]/.test(ch) ? DIGITS[ch] : ch === '-' ? ',' : ch.toUpperCase())).join(' ');
function announce(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  u.voice = voices.find((v) => /en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

const Cross = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v16M4 12h16" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);
const Arrow = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Speaker = ({ on }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {on ? <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
  </svg>
);

const range = (t) =>
  t.ewt_low != null && t.ewt_high != null ? `${t.ewt_low}–${t.ewt_high} min` : `about ${t.ewt_minutes} min`;
const where = (spName) => ROOMS[spName] || spName;

export default function Display() {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(new Date());
  const [soundOn, setSoundOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [maxRows, setMaxRows] = useState(rowsForScreen());
  const order = useRef({});        // token -> time it was first seen as called
  const [freshKey, setFreshKey] = useState('');
  const audio = useRef(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    const load = () =>
      api.get('/public/queue')
        .then((res) => {
          setData(res.data);
          // A reply from the service worker's cache means the data may be out of date
          setOffline(Boolean(res.headers['x-hq-from-cache']));
        })
        .catch(() => setOffline(true));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    const fit = () => setMaxRows(rowsForScreen());
    window.addEventListener('resize', fit);
    return () => { clearInterval(t); window.removeEventListener('resize', fit); };
  }, []);

  // Remember when each token was first seen as called, so the newest call is shown largest
  useEffect(() => {
    if (!data) return;
    const fresh = [];
    data.service_points.forEach((sp) => {
      const ns = sp.now_serving;
      if (ns && ns.status === 'called' && !order.current[ns.token_number]) {
        order.current[ns.token_number] = firstLoad.current ? 1 : Date.now();
        if (!firstLoad.current) fresh.push({ token: ns.token_number, sp: sp.name });
      }
    });
    firstLoad.current = false;
    if (fresh.length) {
      setFreshKey(fresh[fresh.length - 1].token);
      if (soundOn) {
        chime(audio.current);
        if (voiceOn) {
          // Speak after the chime has finished
          setTimeout(() => fresh.forEach((c) =>
            announce(`Token ${sayToken(c.token)}. Please go to ${where(c.sp)}.`)), 1200);
        }
      }
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSound = () => {
    if (!soundOn) {
      // Browsers only allow sound after a click, so the audio is started here
      if (!audio.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audio.current = Ctx ? new Ctx() : null;
      }
      audio.current?.resume();
      chime(audio.current);
      if (voiceOn) setTimeout(() => announce('Announcements on.'), 1200);
    } else {
      window.speechSynthesis?.cancel();
    }
    setSoundOn(!soundOn);
  };

  const tz = { timeZone: 'Africa/Lusaka' };
  const time = now.toLocaleTimeString('en-GB', { ...tz, hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { ...tz, weekday: 'long', day: 'numeric', month: 'long' });
  const updated = data
    ? new Date(data.updated_at).toLocaleTimeString('en-GB', { ...tz, hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const points = data ? data.service_points : [];
  const called = points
    .filter((sp) => sp.now_serving && sp.now_serving.status === 'called')
    .map((sp) => ({ token: sp.now_serving.token_number, sp: sp.name, at: order.current[sp.now_serving.token_number] || 0 }))
    .sort((a, b) => b.at - a.at);
  const [latest, ...earlier] = called;

  return (
    <div className="dsp">
      <style>{CSS}</style>

      <header className="dsp-head">
        <div className="dsp-mark"><Cross /></div>
        <div className="dsp-name">Kalingalinga Clinic</div>
        <div className={`dsp-status ${offline ? 'is-off' : ''}`} role="status">
          <i aria-hidden="true" />
          {offline ? `Offline, last updated ${updated}` : 'Live queue'}
        </div>
        <div className="dsp-clock">
          <div className="dsp-time">{time}</div>
          <div className="dsp-date">{date}</div>
        </div>
      </header>

      {latest ? (
        <section className="dsp-calling" aria-live="assertive">
          <div className="dsp-calling-label">Now calling</div>
          <div key={latest.token} className={latest.token === freshKey ? 'dsp-fresh' : undefined}>
            <div className="dsp-main-token">{latest.token}</div>
            <div className="dsp-main-where"><Arrow /> Please go to {where(latest.sp)}</div>
          </div>
          {earlier.length > 0 && (
            <div className="dsp-earlier">
              <div className="dsp-earlier-label">Also called</div>
              {earlier.slice(0, 3).map((c) => (
                <div key={c.token} className="dsp-earlier-row">
                  <span className="dsp-earlier-token">{c.token}</span>
                  <span className="dsp-earlier-where">{where(c.sp)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="dsp-calling is-idle">
          <div>
            <div className="dsp-idle-text">Please wait for your number</div>
            <div className="dsp-idle-sub">Called numbers appear here. Your place in each queue is shown below.</div>
          </div>
        </section>
      )}

      <main className="dsp-board">
        {points.map((sp) => {
          const ns = sp.now_serving;
          const rows = sp.waiting.slice(0, maxRows);
          const more = Math.max(sp.waiting_count - rows.length, 0);
          return (
            <section key={sp.id} className="dsp-col" style={{ '--accent': accentFor(sp.name) }} aria-label={sp.name}>
              <div className="dsp-col-head">
                <div className="dsp-col-name">{sp.name}</div>
                <div className="dsp-col-count">{sp.waiting_count} waiting</div>
              </div>

              {ns && (
                <div className="dsp-serving">
                  <span>{ns.status === 'called' ? 'Called' : 'In consultation'}</span>
                  <b>{ns.token_number}</b>
                </div>
              )}

              {rows.length === 0 ? (
                <div className="dsp-empty">No one waiting</div>
              ) : (
                <div className="dsp-list">
                  {rows.map((t) => (
                    <div key={t.token_number} className="dsp-row">
                      <span className="dsp-row-token">{t.token_number}</span>
                      {t.priority === 'urgent' && <span className="dsp-urgent">Urgent</span>}
                      <span className="dsp-row-wait">{range(t)}</span>
                    </div>
                  ))}
                  {more > 0 && <div className="dsp-more">and {more} more waiting</div>}
                </div>
              )}
            </section>
          );
        })}
      </main>

      <footer className="dsp-foot">
        <span>Waiting times are estimates and may change if an urgent patient arrives.</span>
        {soundOn && (
          <button type="button" className="dsp-sound" style={{ marginLeft: 'auto', color: voiceOn ? '#007AFF' : '#6E6E73' }}
            aria-pressed={voiceOn}
            onClick={() => {
              if (!voiceOn) announce('Announcements on.');
              else window.speechSynthesis?.cancel();
              setVoiceOn(!voiceOn);
            }}>
            {voiceOn ? 'Spoken announcements on' : 'Spoken announcements off'}
          </button>
        )}
        <button type="button" className="dsp-sound" style={soundOn ? { marginLeft: 12 } : undefined}
          onClick={toggleSound} aria-pressed={soundOn}>
          <Speaker on={soundOn} /> {soundOn ? 'Sound on' : 'Turn on sound'}
        </button>
      </footer>
    </div>
  );
}
