import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import api from '../services/api';

// Optional room names, shown next to a called token.
// Add one line per department, using the exact service point name, for example:
//   'General Outpatient': 'Consultation Room 2',
const ROOMS = {};

// A small accent colour per department (name dot, first-in-line badge and "now serving" tint); anything else uses blue.
// System-style colours that read well on black. Orange is kept for the "Please go to" pill only.
const ACCENTS = [
  { match: /outpatient/i, color: '#0A84FF' },
  { match: /antenatal|anc/i, color: '#BF5AF2' },
  { match: /under.?5|child/i, color: '#FF6482' },
  { match: /pharmacy/i, color: '#30D158' },
];
const accentFor = (name) => (ACCENTS.find((a) => a.match.test(name)) || ACCENTS[0]).color;

// How many waiting tokens fit under each department, by screen height
const rowsForScreen = () => (window.innerHeight >= 1000 ? 5 : window.innerHeight >= 880 ? 4 : window.innerHeight >= 800 ? 3 : 2);

// Light or dark mode. A ?theme=light or ?theme=dark in the address sets it for that screen (handy for a TV
// you can't click on); otherwise the last choice made with the button is remembered on this device.
const THEME_KEY = 'hq-display-theme';
const initialTheme = () => {
  const fromUrl = new URLSearchParams(window.location.search).get('theme');
  if (fromUrl === 'light' || fromUrl === 'dark') return fromUrl;
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage can be blocked; fall back to dark */ }
  return 'dark';
};

// Shrinks a single line of text until it fits its box (used for the big "now calling" token)
function useFitText(dep) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.fontSize = '';
      const size = parseFloat(window.getComputedStyle(el).fontSize);
      if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
        el.style.fontSize = `${Math.floor((size * el.clientWidth) / el.scrollWidth)}px`;
      }
    };
    fit();
    window.addEventListener('resize', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    return () => window.removeEventListener('resize', fit);
  }, [dep]);
  return ref;
}

const CSS = `
.dsp {
  /* Dark theme (default): pure black ground, graphite panels, system blue and orange */
  --ink: #F5F5F7; --muted: #98989D; --soft: #8E8E93; --line: #38383A;
  --bg: #000000; --card: #1C1C1E; --card-2: #2C2C2E; --shadow: none;
  --brand: #0A84FF; --on-brand: #FFFFFF; --glow: rgba(10,132,255,0.26); --brand-soft: rgba(10,132,255,0.16);
  --call: #FF9F0A; --on-call: #000000; --warn: #FF9F0A;
  --urgent: #FF453A; --urgent-bg: rgba(255,69,58,0.16);
  --font: var(--hq-font-body, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
  --display: var(--hq-font-display, var(--font));
  color-scheme: dark;
  height: 100vh; min-height: 640px; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto;
  background: var(--bg); color: var(--ink); font-family: var(--font); overflow: hidden;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1, 'cv11' 1;
  transition: background-color 0.4s, color 0.4s;
}
/* Light theme: Apple-style grouped grey ground with white cards */
.dsp.is-light {
  --ink: #1D1D1F; --muted: #6E6E73; --soft: #6E6E73; --line: #E5E5EA;
  --bg: #F2F2F7; --card: #FFFFFF; --card-2: #F2F2F7; --shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
  --brand: #007AFF; --on-brand: #FFFFFF; --glow: rgba(0,122,255,0.18); --brand-soft: rgba(0,122,255,0.12);
  --warn: #C93400; --urgent: #D70015; --urgent-bg: rgba(255,59,48,0.12);
  color-scheme: light;
}
.dsp *, .dsp *::before { box-sizing: border-box; }

/* Header */
.dsp-head { display: flex; align-items: center; gap: 18px; padding: 22px 48px 18px; min-width: 0; }
.dsp-mark { width: 52px; height: 52px; border-radius: 14px; background: var(--brand); color: var(--on-brand); display: grid; place-items: center; flex: none; }
.dsp-brand { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dsp-name { font-family: var(--display); font-size: 30px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.1; overflow-wrap: anywhere; }
.dsp-tag { font-size: 16px; font-weight: 500; color: var(--muted); }
.dsp-status { flex: none; display: inline-flex; align-items: center; gap: 10px; margin-left: 14px; padding: 8px 16px; border-radius: 999px; font-size: 16px; font-weight: 600; color: var(--ink); background: var(--card); box-shadow: var(--shadow); white-space: nowrap; }
.dsp-status i { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 0 rgba(10,132,255,0.55); animation: dsp-pulse 2s infinite; }
.dsp-status.is-off { color: var(--warn); }
.dsp-status.is-off i { background: var(--warn); animation: none; }
@keyframes dsp-pulse { 0% { box-shadow: 0 0 0 0 rgba(10,132,255,0.55); } 70% { box-shadow: 0 0 0 10px rgba(10,132,255,0); } 100% { box-shadow: 0 0 0 0 rgba(10,132,255,0); } }
.dsp-clock { flex: none; margin-left: auto; text-align: right; }
.dsp-time { font-family: var(--display); font-size: 46px; font-weight: 600; line-height: 1; letter-spacing: -0.03em; }
.dsp-date { font-size: 16px; color: var(--muted); margin-top: 6px; font-weight: 500; white-space: nowrap; }

/* Now calling: the one bold element on the screen */
.dsp-calling { position: relative; overflow: hidden; margin: 6px 48px 0; border-radius: 32px; color: var(--ink); padding: 26px 44px 28px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 34%); gap: 10px 44px; align-items: stretch; min-height: 230px;
  background: radial-gradient(90% 120% at 0% 0%, var(--glow), transparent 55%), var(--card); box-shadow: var(--shadow); }
.dsp-calling-label { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--brand); }
.dsp-calling-label::before { content: ''; width: 11px; height: 11px; border-radius: 50%; background: var(--brand); animation: dsp-breathe 2s ease-in-out infinite; }
@keyframes dsp-breathe { 50% { opacity: 0.35; } }
.dsp-main { display: flex; flex-direction: column; justify-content: flex-end; min-width: 0; }
/* The token is also shrunk to fit by useFitText, so a long token never runs off the card */
.dsp-main-token { font-family: var(--display); font-size: clamp(80px, 11.5vw, 210px); font-weight: 700; line-height: 1; letter-spacing: -0.045em; white-space: nowrap; padding-left: 0.02em; }
.dsp-main-where { margin-top: 20px; display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; min-width: 0; }
.dsp-go { font-size: clamp(20px, 1.6vw, 28px); font-weight: 500; color: var(--muted); }
.dsp-room { display: inline-flex; align-items: center; gap: 12px; max-width: 100%; padding: 12px 26px 12px 18px; border-radius: 28px; background: var(--call); color: var(--on-call); font-size: clamp(22px, 2vw, 34px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; overflow-wrap: anywhere; }
.dsp-room svg { flex: none; }
.dsp-earlier { container-type: inline-size; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; background: var(--card-2); border-radius: 22px; padding: 20px 24px; min-width: 0; }
.dsp-earlier-label { font-size: 16px; font-weight: 500; color: var(--muted); margin-bottom: 4px; }
.dsp-earlier-row { display: flex; align-items: center; justify-content: space-between; gap: 6px 16px; padding: 8px 0; border-top: 1px solid var(--line); }
.dsp-earlier-label + .dsp-earlier-row { border-top: none; }
.dsp-earlier-token { flex: none; font-family: var(--display); font-size: clamp(24px, 12cqi, 38px); font-weight: 600; letter-spacing: -0.03em; white-space: nowrap; }
.dsp-earlier-where { min-width: 0; font-size: clamp(14px, 5.5cqi, 18px); line-height: 1.25; font-weight: 500; color: var(--muted); text-align: right; overflow-wrap: anywhere; }
.dsp-calling.is-idle { grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 28px; min-height: 180px; background: var(--card); }
.dsp-idle-icon { width: 84px; height: 84px; border-radius: 24px; background: var(--brand-soft); color: var(--brand); display: grid; place-items: center; }
.dsp-idle-text { font-family: var(--display); font-size: clamp(30px, 3vw, 46px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; }
.dsp-idle-sub { font-size: clamp(17px, 1.5vw, 22px); color: var(--muted); margin-top: 8px; }
.dsp-fresh { animation: dsp-in 700ms cubic-bezier(.2,.8,.2,1); }
@keyframes dsp-in { from { opacity: 0; transform: translateY(20px) scale(0.98); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }

/* Department board: one column per department, always on one row.
   Every size inside a card follows the card's own width (cqi), so text fits whether there are 3 or 6 departments. */
.dsp-board { margin: 20px 48px 0; display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap: 20px; min-height: 0; }
.dsp-col { container-type: inline-size; background: var(--card); border-radius: 26px; box-shadow: var(--shadow); display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
.dsp-col-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: clamp(14px, 7cqi, 22px) clamp(14px, 7cqi, 24px) 0; }
.dsp-col-name { display: flex; align-items: flex-start; gap: 10px; min-width: 0; font-family: var(--display); font-size: clamp(16px, 7.5cqi, 24px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; overflow-wrap: break-word; hyphens: auto; }
.dsp-col-name::before { content: ''; flex: none; width: 0.42em; height: 0.42em; margin-top: 0.4em; border-radius: 50%; background: var(--accent); }
/* Long names wrap between words instead of being cut off */
.dsp-col-name span { min-width: 0; }
.dsp-col-count { flex: none; text-align: right; font-size: clamp(12px, 4.5cqi, 14px); font-weight: 500; color: var(--muted); line-height: 1.1; white-space: nowrap; }
.dsp-col-count b { display: block; font-family: var(--display); font-size: clamp(22px, 10cqi, 30px); font-weight: 700; color: var(--ink); letter-spacing: -0.03em; }
.dsp-serving { margin: clamp(10px, 5cqi, 16px) clamp(10px, 5cqi, 16px) 0; padding: clamp(8px, 4cqi, 12px) clamp(10px, 5cqi, 16px); border-radius: 16px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 2px 10px;
  background: var(--card-2); background: color-mix(in srgb, var(--accent) 16%, var(--card)); }
.dsp-serving span { font-size: clamp(12px, 5cqi, 15px); font-weight: 500; color: var(--ink); opacity: 0.8; white-space: nowrap; }
.dsp-serving b { font-family: var(--display); font-size: clamp(18px, 9cqi, 26px); font-weight: 700; color: var(--ink); letter-spacing: -0.02em; white-space: nowrap; }
.dsp-list { margin: 10px 0 0; padding: 0 clamp(14px, 7cqi, 24px) 16px; min-width: 0; }
.dsp-list-head { display: flex; justify-content: space-between; gap: 8px; font-size: clamp(11px, 4.2cqi, 13px); font-weight: 500; color: var(--soft); padding: 6px 0 4px; }
.dsp-row { display: flex; align-items: center; gap: clamp(6px, 3.5cqi, 12px); padding: 8px 0; border-top: 1px solid var(--line); min-width: 0; }
.dsp-pos { width: clamp(22px, 9.5cqi, 30px); height: clamp(22px, 9.5cqi, 30px); flex: none; border-radius: 50%; background: var(--card-2); color: var(--muted); font-size: clamp(12px, 4.8cqi, 15px); font-weight: 600; display: grid; place-items: center; }
.dsp-list-head + .dsp-row .dsp-pos { background: var(--accent); color: #000; }
.dsp-row-id { display: flex; align-items: center; gap: 4px 10px; min-width: 0; flex-wrap: wrap; }
.dsp-row-token { font-family: var(--display); font-size: clamp(18px, 9cqi, 28px); font-weight: 600; letter-spacing: -0.02em; white-space: nowrap; line-height: 1.1; }
.dsp-row-wait { margin-left: auto; flex: none; font-size: clamp(13px, 5.6cqi, 18px); font-weight: 500; color: var(--muted); white-space: nowrap; text-align: right; }
.dsp-urgent { flex: none; font-size: clamp(11px, 4cqi, 13px); font-weight: 700; color: var(--urgent); background: var(--urgent-bg); border-radius: 999px; padding: 3px 9px; line-height: 1.3; }
.dsp-more { margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--line); font-size: clamp(13px, 5cqi, 16px); font-weight: 500; color: var(--muted); }
.dsp-more.is-only { margin-top: 0; border-top: none; }
.dsp-empty { margin: auto 16px; padding: 28px 0; text-align: center; font-size: clamp(15px, 6cqi, 20px); font-weight: 500; color: var(--soft); }
/* Narrow cards (5–6 departments): the Urgent tag drops under the token so the wait time keeps its room */
@container (max-width: 250px) {
  .dsp-row-id { flex-direction: column; align-items: flex-start; }
  .dsp-list-head span:first-child { white-space: nowrap; }
}
/* Narrow cards: the waiting count moves under the name, so the full name gets the whole width */
@container (max-width: 270px) {
  .dsp-col-head { flex-direction: column; gap: 4px; }
  .dsp-col-count { display: flex; align-items: baseline; gap: 6px; text-align: left; padding-left: calc(0.42em + 10px); }
  .dsp-col-count b { display: inline; font-size: 20px; }
}

/* Footer */
.dsp-foot { display: flex; align-items: center; gap: 12px; padding: 18px 48px 26px; font-size: 17px; color: var(--muted); min-width: 0; }
.dsp-note { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.dsp-note svg { flex: none; }
.dsp-btn { flex: none; display: inline-flex; align-items: center; gap: 8px; border: none; background: var(--card); box-shadow: var(--shadow); border-radius: 999px; padding: 10px 18px; min-height: 44px; font: inherit; font-size: 16px; font-weight: 600; color: var(--ink); cursor: pointer; transition: background 0.2s; white-space: nowrap; }
.dsp-btn:hover { background: var(--card-2); }
.dsp-btn:first-of-type { margin-left: auto; }
.dsp-btn.is-on { color: var(--brand); }
.dsp-btn.is-muted { color: var(--muted); }
.dsp-btn:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }

@media (max-width: 1500px) {
  .dsp-head, .dsp-foot { padding-left: 32px; padding-right: 32px; }
  .dsp-calling, .dsp-board { margin-left: 32px; margin-right: 32px; }
  .dsp-calling { min-height: 170px; padding: 22px 32px 26px; gap: 8px 32px; border-radius: 28px; }
  .dsp-main-token { font-size: clamp(80px, 9vw, 160px); }
  .dsp-board { margin-top: 18px; gap: 14px; }
  .dsp-col { border-radius: 22px; }
  .dsp-name { font-size: 26px; }
  .dsp-time { font-size: 38px; }
  .dsp-foot { font-size: 15px; }
  .dsp-btn { font-size: 15px; padding: 8px 14px; }
}
/* Short screens (e.g. 1366 x 768 laptops and TVs): give the department lists more room */
@media (max-height: 820px) {
  .dsp-head { padding-top: 14px; padding-bottom: 10px; }
  .dsp-mark { width: 44px; height: 44px; border-radius: 12px; }
  .dsp-calling { min-height: 0; padding: 18px 32px 20px; }
  .dsp-calling-label { font-size: 18px; }
  .dsp-main-token { font-size: clamp(72px, 8vw, 130px); }
  .dsp-main-where { margin-top: 12px; }
  .dsp-earlier { padding: 12px 20px; gap: 0; }
  .dsp-earlier-label { margin-bottom: 0; font-size: 14px; }
  .dsp-earlier-row { padding: 5px 0; }
  .dsp-earlier-token { font-size: clamp(22px, 10cqi, 30px); }
  .dsp-board { margin-top: 14px; }
  .dsp-foot { padding-top: 12px; padding-bottom: 14px; }
}
@media (max-width: 1100px) {
  .dsp-status { margin-left: 0; }
  .dsp-note { display: none; }
}
@media (max-width: 900px) {
  .dsp { height: auto; overflow: visible; }
  .dsp-head { flex-wrap: wrap; }
  .dsp-calling { grid-template-columns: 1fr; }
  .dsp-board { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .dsp-foot { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) {
  .dsp, .dsp-status i, .dsp-calling-label::before, .dsp-fresh { animation: none; transition: none; }
}
`;

// A short two-note chime, made in the browser so no sound file is needed
function chime(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  [[880, 0], [660, 0.16]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + at);
    gain.gain.linearRampToValueAtTime(0.3, now + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.5);
  });
}
const SPEAK_AFTER_MS = 550;   // the chime above lasts about half a second

// Spoken announcement, using the browser's built-in voice.
// "GOP-007" is read as "G O P 7": letters one by one, then the number as a number.
const sayToken = (token) => {
  const [prefix, num] = token.split('-');
  return `${prefix.split('').join(' ')} ${num ? parseInt(num, 10) : ''}`.trim();
};

// Voices load in the background, so the best one is picked again whenever the list changes.
// Natural-sounding voices (Edge "Natural", Chrome "Google") are preferred, then any English voice.
let bestVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  bestVoice =
    voices.find((v) => /natural/i.test(v.name) && /en-GB/i.test(v.lang)) ||
    voices.find((v) => /natural/i.test(v.name)) ||
    voices.find((v) => /google uk english/i.test(v.name)) ||
    voices.find((v) => /google/i.test(v.name)) ||
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices[0] || null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}
function announce(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  if (bestVoice) { u.voice = bestVoice; u.lang = bestVoice.lang; }
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

// HealthQueue mark: three tokens in a line
const Mark = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <circle cx="5" cy="12" r="2.6" /><circle cx="12" cy="12" r="3.4" /><circle cx="19" cy="12" r="2.6" />
  </svg>
);
const Arrow = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Speaker = ({ on }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {on ? <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
  </svg>
);
const Sun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
  </svg>
);
const Info = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);
const Ticket = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3a2 2 0 000-4V7z" /><path d="M14 5v14" strokeDasharray="2 2.5" />
  </svg>
);

const range = (t) =>
  t.ewt_low != null && t.ewt_high != null ? `${t.ewt_low}–${t.ewt_high} min` : `about ${t.ewt_minutes} min`;
const where = (spName) => ROOMS[spName] || spName;

// One department card. It shows up to maxRows waiting tokens, then measures itself and drops rows
// until everything fits, so the "+ N more waiting" line is never cut off on a short screen.
function DeptCard({ sp, maxRows }) {
  const ref = useRef(null);
  const [fit, setFit] = useState(maxRows);
  const [sizeKey, setSizeKey] = useState(0);
  const waitingKey = sp.waiting.map((t) => `${t.token_number}:${t.priority}`).join(',') + (sp.now_serving ? sp.now_serving.status : '');

  useEffect(() => {
    const onResize = () => setSizeKey((k) => k + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Start again from the most rows whenever the data or the screen size changes
  useLayoutEffect(() => { setFit(maxRows); }, [maxRows, waitingKey, sizeKey]);
  // Then trim one row at a time while the card overflows
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && fit > 0 && el.scrollHeight > el.clientHeight + 1) setFit((f) => f - 1);
  });

  const ns = sp.now_serving;
  const rows = sp.waiting.slice(0, Math.min(fit, maxRows));
  const more = Math.max(sp.waiting_count - rows.length, 0);
  return (
    <section ref={ref} className="dsp-col" style={{ '--accent': accentFor(sp.name) }} aria-label={sp.name}>
      <div className="dsp-col-head">
        <div className="dsp-col-name" title={sp.name}><span>{sp.name}</span></div>
        <div className="dsp-col-count"><b>{sp.waiting_count}</b>waiting</div>
      </div>

      {ns && (
        <div className="dsp-serving">
          <span>{ns.status === 'called' ? 'Called' : 'In consultation'}</span>
          <b>{ns.token_number}</b>
        </div>
      )}

      {sp.waiting_count === 0 ? (
        <div className="dsp-empty">No one waiting</div>
      ) : (
        <div className="dsp-list">
          {rows.length > 0 && <div className="dsp-list-head"><span>Next in line</span><span>Est. wait</span></div>}
          {rows.map((t, i) => (
            <div key={t.token_number} className="dsp-row">
              <span className="dsp-pos" aria-hidden="true">{i + 1}</span>
              <span className="dsp-row-id">
                <span className="dsp-row-token">{t.token_number}</span>
                {t.priority === 'urgent' && <span className="dsp-urgent">Urgent</span>}
              </span>
              <span className="dsp-row-wait">{range(t)}</span>
            </div>
          ))}
          {more > 0 && <div className={`dsp-more ${rows.length === 0 ? 'is-only' : ''}`}>{rows.length === 0 ? `${more} waiting` : `+ ${more} more waiting`}</div>}
        </div>
      )}
    </section>
  );
}

export default function Display() {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(new Date());
  const [soundOn, setSoundOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [maxRows, setMaxRows] = useState(rowsForScreen());
  const [theme, setTheme] = useState(initialTheme);
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
    const timer = setInterval(load, 2000);   // a new call shows within 2 seconds
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
          // Speak as soon as the chime has finished
          setTimeout(() => fresh.forEach((c) =>
            announce(`Token ${sayToken(c.token)}, please go to ${where(c.sp)}.`)), SPEAK_AFTER_MS);
        }
      }
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember the chosen theme on this device
  useEffect(() => {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Keyboard shortcut for kiosks: press T to switch light/dark
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleTheme();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleSound = () => {
    if (!soundOn) {
      // Browsers only allow sound after a click, so the audio is started here
      if (!audio.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audio.current = Ctx ? new Ctx() : null;
      }
      audio.current?.resume();
      chime(audio.current);
      if (voiceOn) setTimeout(() => announce('Announcements on.'), SPEAK_AFTER_MS);
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
  const tokenRef = useFitText(latest ? latest.token : '');

  return (
    <div className={`dsp ${theme === 'light' ? 'is-light' : ''}`} lang="en">
      <style>{CSS}</style>

      <header className="dsp-head">
        <div className="dsp-mark"><Mark /></div>
        <div className="dsp-brand">
          <div className="dsp-name">Kalingalinga Clinic</div>
          <div className="dsp-tag">Patient queue</div>
        </div>
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
          <div key={latest.token} className={`dsp-main ${latest.token === freshKey ? 'dsp-fresh' : ''}`}>
            <div className="dsp-main-token" ref={tokenRef}>{latest.token}</div>
            <div className="dsp-main-where">
              <span className="dsp-go">Please go to</span>
              <span className="dsp-room"><Arrow /> {where(latest.sp)}</span>
            </div>
          </div>
          {earlier.length > 0 && (
            <div className="dsp-earlier">
              <div className="dsp-earlier-label">Also called</div>
              {earlier.slice(0, maxRows <= 2 ? 2 : 3).map((c) => (
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
          <div className="dsp-idle-icon"><Ticket /></div>
          <div>
            <div className="dsp-idle-text">Please wait for your number</div>
            <div className="dsp-idle-sub">Called numbers appear here. Your place in each queue is shown below.</div>
          </div>
        </section>
      )}

      <main className="dsp-board" style={{ '--cols': Math.max(1, points.length) }}>
        {points.map((sp) => <DeptCard key={sp.id} sp={sp} maxRows={maxRows} />)}
      </main>

      <footer className="dsp-foot">
        <span className="dsp-note"><Info /> Waiting times are estimates and may change if an urgent patient arrives.</span>
        <button type="button" className="dsp-btn" onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun /> : <Moon />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        {soundOn && (
          <button type="button" className={`dsp-btn ${voiceOn ? 'is-on' : 'is-muted'}`}
            aria-pressed={voiceOn}
            onClick={() => {
              if (!voiceOn) announce('Announcements on.');
              else window.speechSynthesis?.cancel();
              setVoiceOn(!voiceOn);
            }}>
            {voiceOn ? 'Spoken announcements on' : 'Spoken announcements off'}
          </button>
        )}
        <button type="button" className={`dsp-btn ${soundOn ? 'is-on' : ''}`} onClick={toggleSound} aria-pressed={soundOn}>
          <Speaker on={soundOn} /> {soundOn ? 'Sound on' : 'Turn on sound'}
        </button>
      </footer>
    </div>
  );
}
