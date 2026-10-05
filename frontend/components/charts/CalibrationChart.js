const SIZE = 300;

// bins: [{ predicted, actual, games }] for the favourite's probability (0.5-1).
export default function CalibrationChart({ bins }) {
  const pad = 34;
  const lo = 0.5;
  const s = (v) => pad + ((v - lo) / (1 - lo)) * (SIZE - pad - 10);
  const sy = (v) => SIZE - pad - ((v - lo) / (1 - lo)) * (SIZE - pad - 10);
  const points = bins.filter((b) => b.games > 0 && b.predicted != null);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full max-w-[320px]" role="img" aria-label="Calibration chart">
      <rect x={pad} y="10" width={SIZE - pad - 10} height={SIZE - pad - 10} fill="#0f1319" />
      <line x1={s(0.5)} y1={sy(0.5)} x2={s(1)} y2={sy(1)} stroke="#5d6673" strokeDasharray="4 4" />
      {points.map((b) => (
        <g key={b.from}>
          <circle cx={s(b.predicted)} cy={sy(Math.max(lo, b.actual))} r={Math.min(9, 3.5 + Math.sqrt(b.games))} fill="#4a8ef0" opacity="0.9">
            <title>{`${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%: predicted ${(b.predicted * 100).toFixed(0)}%, favourite won ${(b.actual * 100).toFixed(0)}% (${b.games} games)`}</title>
          </circle>
        </g>
      ))}
      <text x={pad - 6} y="18" textAnchor="end" className="fill-faint text-[10px]">100%</text>
      <text x={pad - 6} y={SIZE - pad} textAnchor="end" className="fill-faint text-[10px]">50%</text>
      <text x={pad} y={SIZE - 14} className="fill-faint text-[10px]">Predicted 50%</text>
      <text x={SIZE - 10} y={SIZE - 14} textAnchor="end" className="fill-faint text-[10px]">100%</text>
    </svg>
  );
}
