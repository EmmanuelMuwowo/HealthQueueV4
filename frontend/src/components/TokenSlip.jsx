// A small printed ticket for patients without a phone (or anyone who wants one).
// It is hidden on screen and is the only thing that prints (see "Printing" in index.css).
// The slip carries no patient name, so a lost slip reveals nothing about the patient.

const when = (d) =>
  new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Lusaka',
  });

const rangeText = (e) =>
  e && e.ewt_low != null && e.ewt_high != null ? `${e.ewt_low}–${e.ewt_high} min` : `about ${e?.ewt_minutes ?? 0} min`;

export const printSlip = () => window.print();

export default function TokenSlip({ token, servicePoint, visitType, ewt, issuedAt }) {
  if (!token) return null;
  return (
    <div className="hq-slip" aria-hidden="true">
      <div className="hq-slip-clinic">Kalingalinga Clinic</div>
      <div className="hq-slip-label">Your number</div>
      <div className="hq-slip-token">{token}</div>
      <div className="hq-slip-sp">{servicePoint}</div>
      {visitType && <div className="hq-slip-small">{visitType}</div>}
      <div className="hq-slip-rule" />
      <div className="hq-slip-row"><span>Patients ahead</span><b>{ewt?.patients_ahead ?? 0}</b></div>
      <div className="hq-slip-row"><span>Estimated wait</span><b>{rangeText(ewt)}</b></div>
      <div className="hq-slip-rule" />
      <div className="hq-slip-note">
        Please stay near the waiting area and watch the screen. Your number will be shown and called.
        Waiting times are estimates.
      </div>
      <div className="hq-slip-small">Issued {when(issuedAt || Date.now())}</div>
    </div>
  );
}
