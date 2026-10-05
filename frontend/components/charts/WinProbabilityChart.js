const W = 760;

// series: [{ seconds_left, home_wp }]; regulation is 3600 seconds, overtime extends past it.
export default function WinProbabilityChart({ series, home, away, colors = { home: '#6aa6ff', away: '#f0913f' }, height = 260 }) {
  if (!series?.length) {
    return <div className="flex h-48 items-center justify-center text-sm text-muted">Win probability appears once the game kicks off.</div>;
  }
  const left = 70;
  const right = W - 10;
  const top = 14;
  const bottom = height - 26;
  const total = Math.max(3600, ...series.map((p) => 3600 - p.seconds_left));
  const x = (elapsed) => left + (elapsed / total) * (right - left);
  const y = (wp) => top + (1 - wp) * (bottom - top);
  const path = series
    .map((p, i) => `${i ? 'L' : 'M'}${x(Math.max(0, 3600 - p.seconds_left)).toFixed(1)},${y(p.home_wp).toFixed(1)}`)
    .join(' ');
  const quarters = [0, 900, 1800, 2700, 3600];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={`Win probability for ${home}`}>
      <rect x={left} y={top} width={right - left} height={bottom - top} fill="#0f1319" />
      {quarters.slice(1, 4).map((q) => (
        <line key={q} x1={x(q)} x2={x(q)} y1={top} y2={bottom} stroke="#232a34" />
      ))}
      <line x1={left} x2={right} y1={y(0.5)} y2={y(0.5)} stroke="#3a424e" strokeDasharray="4 4" />
      <path d={path} fill="none" stroke="#e7eaee" strokeWidth="2.2" strokeLinejoin="round" />
      <text x={left - 8} y={top + 10} textAnchor="end" fill={colors.home} className="text-[11px] font-semibold">{home} 100%</text>
      <text x={left - 8} y={y(0.5) + 4} textAnchor="end" className="fill-faint text-[11px]">50%</text>
      <text x={left - 8} y={bottom} textAnchor="end" fill={colors.away} className="text-[11px] font-semibold">{away} 100%</text>
      {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
        <text key={q} x={x(quarters[i] + 450)} y={height - 6} textAnchor="middle" className="fill-faint text-[11px]">
          {q}
        </text>
      ))}
      {total > 3600 && (
        <text x={x((3600 + total) / 2)} y={height - 6} textAnchor="middle" className="fill-faint text-[11px]">OT</text>
      )}
    </svg>
  );
}
