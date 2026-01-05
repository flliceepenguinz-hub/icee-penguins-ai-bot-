import './RiskGauge.css';

function colorForRisk(riskScore) {
  if (riskScore < 30) return 'var(--ok)';
  if (riskScore < 60) return 'var(--warn)';
  if (riskScore < 80) return 'var(--high)';
  return 'var(--danger)';
}

export function RiskGauge({ riskScore = 0, riskLevel = 'LOW' }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, riskScore)) / 100;
  const dash = c * pct;
  const gap = c - dash;
  const stroke = colorForRisk(riskScore);

  return (
    <div className="riskGauge">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Risk score ${riskScore} out of 100`}>
        <circle cx="70" cy="70" r={r} className="riskGaugeTrack" />
        <circle
          cx="70"
          cy="70"
          r={r}
          className="riskGaugeValue"
          style={{
            stroke,
            strokeDasharray: `${dash} ${gap}`,
          }}
        />
      </svg>
      <div className="riskGaugeText">
        <div className="riskGaugeScore">{riskScore}</div>
        <div className="riskGaugeLabel">Risk ({riskLevel})</div>
        <div className="riskGaugeHint">0 = safe, 100 = urgent</div>
      </div>
    </div>
  );
}

