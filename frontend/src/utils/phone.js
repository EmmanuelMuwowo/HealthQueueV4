// Zambian mobile prefixes: Airtel 97/77, MTN 96/76, Zamtel 95/75 (same rule as the server)
const PREFIXES = ['95', '96', '97', '75', '76', '77'];

export const normalizePhone = (raw) => {
  if (!raw) return null;
  let d = String(raw).replace(/[\s\-().]/g, '');
  if (d.startsWith('+260')) d = d.slice(4);
  else if (d.startsWith('260') && d.length === 12) d = d.slice(3);
  else if (d.startsWith('0') && d.length === 10) d = d.slice(1);
  if (!/^\d{9}$/.test(d)) return null;
  if (!PREFIXES.includes(d.slice(0, 2))) return null;
  return `0${d}`;
};