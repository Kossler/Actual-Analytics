import { useMemo, useState } from 'react';
import { formatValue } from '../../lib/format';
import { BRAND, UI } from '../../lib/brand';

const W = 760;
const PAD = { top: 18, right: 24, bottom: 42, left: 58 };

function niceTicks(min, max, count = 5) {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

// points: [{ id, x, y, label, highlight, href }]
// invertY: draw lower values higher (e.g. EPA allowed, where lower is better).
export default function ScatterPlot({
  points,
  height = 380,
  xLabel,
  yLabel,
  xFormat = 'signed2',
  yFormat = 'signed2',
  invertY = false,
  quadrants = {},
  fitLine,
  onPointClick,
}) {
  const [hover, setHover] = useState(null);
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  const scales = useMemo(() => {
    if (!valid.length) return null;
    const xs = valid.map((p) => p.x);
    const ys = valid.map((p) => p.y);
    const pad = (lo, hi) => {
      const span = hi - lo || Math.abs(hi) || 1;
      return [lo - span * 0.08, hi + span * 0.08];
    };
    const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
    const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
    const innerW = W - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const sx = (v) => PAD.left + ((v - x0) / (x1 - x0)) * innerW;
    const sy = (v) => (invertY ? PAD.top + ((v - y0) / (y1 - y0)) * innerH : PAD.top + ((y1 - v) / (y1 - y0)) * innerH);
    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    return { x0, x1, y0, y1, sx, sy, mx: mean(xs), my: mean(ys), innerW, innerH };
  }, [valid, height, invertY]);

  if (!scales) return <div className="flex h-40 items-center justify-center text-sm text-muted">Not enough data to plot.</div>;
  const { x0, x1, y0, y1, sx, sy, mx, my } = scales;
  const right = W - PAD.right;
  const bottom = height - PAD.bottom;
  const top = PAD.top;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full select-none" role="img" aria-label={`${yLabel} versus ${xLabel}`}>
      {/* grid + ticks */}
      {niceTicks(x0, x1).map((t) => (
        <g key={`x${t}`}>
          <line x1={sx(t)} x2={sx(t)} y1={top} y2={bottom} stroke={UI.line} />
          <text x={sx(t)} y={bottom + 18} textAnchor="middle" className="fill-faint text-[11px]">
            {formatValue(t, xFormat)}
          </text>
        </g>
      ))}
      {niceTicks(y0, y1).map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD.left} x2={right} y1={sy(t)} y2={sy(t)} stroke={UI.line} />
          <text x={PAD.left - 10} y={sy(t) + 4} textAnchor="end" className="fill-faint text-[11px]">
            {formatValue(t, yFormat)}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={PAD.left} y1={top} y2={bottom} stroke={UI.lineStrong} />
      <line x1={PAD.left} x2={right} y1={bottom} y2={bottom} stroke={UI.lineStrong} />

      {/* group averages */}
      <line x1={sx(mx)} x2={sx(mx)} y1={top} y2={bottom} stroke={UI.faint} strokeDasharray="3 4" />
      <line x1={PAD.left} x2={right} y1={sy(my)} y2={sy(my)} stroke={UI.faint} strokeDasharray="3 4" />

      {quadrants.topRight && (
        <text x={right - 6} y={top + 14} textAnchor="end" className="fill-good text-[10.5px] font-bold tracking-[0.08em]">
          {quadrants.topRight}
        </text>
      )}
      {quadrants.bottomLeft && (
        <text x={PAD.left + 8} y={bottom - 8} className="fill-bad text-[10.5px] font-bold tracking-[0.08em]">
          {quadrants.bottomLeft}
        </text>
      )}

      {fitLine && (
        <line
          x1={sx(x0)} y1={sy(fitLine.intercept + fitLine.slope * x0)}
          x2={sx(x1)} y2={sy(fitLine.intercept + fitLine.slope * x1)}
          stroke={UI.good} strokeWidth="2" opacity="0.8"
        />
      )}

      {valid.filter((p) => !p.highlight).map((p) => (
        <g
          key={p.id}
          onMouseEnter={() => setHover(p)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onPointClick && onPointClick(p)}
          className={onPointClick ? 'cursor-pointer' : undefined}
        >
          <circle cx={sx(p.x)} cy={sy(p.y)} r={p.label ? 4.5 : 3.2} fill={UI.muted} opacity={p.label ? 1 : 0.6} />
          <circle cx={sx(p.x)} cy={sy(p.y)} r="10" fill="transparent" />
          {p.label && (
            <text x={sx(p.x) + 8} y={sy(p.y) + 4} className="fill-muted text-[11px]">
              {p.label}
            </text>
          )}
        </g>
      ))}
      {valid.filter((p) => p.highlight).map((p) => (
        <g key={p.id}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r="8" fill={BRAND.red} stroke={BRAND.offWhite} strokeWidth="2.5" />
          <text x={sx(p.x) + 13} y={sy(p.y) + 4} className="fill-ink text-[12px] font-bold">
            {p.label}
          </text>
        </g>
      ))}

      {yLabel && (
        <text x={PAD.left} y={top - 6} className="fill-muted text-[11px] font-semibold">
          ↑ {yLabel}
        </text>
      )}
      {xLabel && (
        <text x={right} y={height - 6} textAnchor="end" className="fill-muted text-[11px] font-semibold">
          {xLabel} →
        </text>
      )}

      {hover && (
        <g transform={`translate(${Math.min(sx(hover.x) + 12, right - 170)}, ${Math.max(sy(hover.y) - 52, top)})`} pointerEvents="none">
          <rect width="170" height="46" rx="6" fill={UI.raised} stroke={UI.lineStrong} />
          <text x="10" y="18" className="fill-ink text-[12px] font-semibold">{hover.name || hover.label || hover.id}</text>
          <text x="10" y="35" className="fill-muted text-[11px]">
            {formatValue(hover.x, xFormat)} · {formatValue(hover.y, yFormat)}
          </text>
        </g>
      )}
    </svg>
  );
}
