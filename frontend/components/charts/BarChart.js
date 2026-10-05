import { formatValue } from '../../lib/format';
import { UI } from '../../lib/brand';

const W = 760;

// Signed bars per item with value labels, plus an optional dashed reference line.
// items: [{ key, label, value }]; better: which direction is good (colors bars blue/orange).
export default function BarChart({ items, format = 'signed2', reference, referenceLabel, better = 'high', height = 300, baseline = 0 }) {
  const values = items.map((i) => i.value).filter((v) => Number.isFinite(v));
  if (!values.length) return <div className="flex h-40 items-center justify-center text-sm text-muted">No games yet.</div>;
  const refs = Number.isFinite(reference) ? [reference] : [];
  const max = Math.max(baseline, ...values, ...refs);
  const min = Math.min(baseline, ...values, ...refs);
  const span = max - min || 1;
  const top = 34;
  const bottom = height - 52;
  const y = (v) => top + ((max - v) / span) * (bottom - top);
  const slot = (W - 40) / items.length;
  const barW = Math.min(110, slot * 0.42);
  const goodColor = UI.goodFill;
  const badColor = UI.badFill;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Week by week chart">
      <line x1="20" x2={W - 20} y1={y(baseline)} y2={y(baseline)} stroke={UI.lineStrong} />
      {refs.map((r) => (
        <g key="ref">
          <line x1="20" x2={W - 20} y1={y(r)} y2={y(r)} stroke={UI.muted} strokeDasharray="4 4" />
          {referenceLabel && (
            <text x={W - 22} y={y(r) - 7} textAnchor="end" className="fill-muted text-[11px]" style={{ paintOrder: 'stroke', stroke: UI.surface, strokeWidth: 4 }}>
              {referenceLabel}
            </text>
          )}
        </g>
      ))}
      {items.map((item, i) => {
        const cx = 20 + slot * i + slot / 2;
        const v = item.value;
        if (!Number.isFinite(v)) {
          return (
            <text key={item.key} x={cx} y={height - 10} textAnchor="middle" className="fill-faint text-[12px]">
              {item.label}
            </text>
          );
        }
        const positive = v >= baseline;
        const good = better === 'low' ? !positive : positive;
        const y0 = y(Math.max(v, baseline));
        const h = Math.max(1.5, Math.abs(y(v) - y(baseline)));
        return (
          <g key={item.key}>
            <rect x={cx - barW / 2} y={y0} width={barW} height={h} rx="2" fill={good ? goodColor : badColor} />
            <text
              x={cx}
              y={positive ? y0 - 8 : y0 + h + 16}
              textAnchor="middle"
              className="fill-ink text-[12px] font-semibold"
            >
              {formatValue(v, format)}
            </text>
            <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted text-[12px]">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
