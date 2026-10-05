import Link from 'next/link';

export function PageHeader({ eyebrow, title, right, children }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1.5 flex flex-wrap items-center gap-2 text-muted">{eyebrow}</div>}
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-[2.6rem]">{title}</h1>
        {children}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Card({ title, subtitle, action, className = '', bodyClassName = 'p-5', children }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-4">
          <div>
            {title && <h2 className="font-sans text-[17px] font-bold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex rounded-xl border border-line bg-surface p-1 ${className}`} role="tablist">
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
              active ? 'bg-ink text-page' : 'text-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Joined button group used for column sets ("Standard | Efficiency | Advanced | Custom…").
export function ButtonGroup({ options, value, onChange }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line">
      {options.map((o, i) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-10 px-3 text-[13px] transition-colors ${i ? 'border-l border-line' : ''} ${
              active ? 'bg-line font-semibold text-ink' : 'bg-raised text-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, right }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line">
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const tab = typeof t === 'string' ? { value: t, label: t } : t;
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-left text-sm transition-colors ${
                active ? 'border-brand font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.sub && <span className="block text-xs font-normal text-faint">{tab.sub}</span>}
            </button>
          );
        })}
      </div>
      {right}
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Select({ value, onChange, options, className = '', ...rest }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`control cursor-pointer appearance-none bg-[length:10px] bg-[right_0.75rem_center] bg-no-repeat pr-8 ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%236f7886' stroke-width='1.5'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {options.map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: String(o) };
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Stepper({ value, onChange, step = 5, min = 0, className = '' }) {
  const set = (v) => onChange(Math.max(min, Number.isFinite(v) ? v : min));
  return (
    <div className={`control flex items-center gap-2 pr-1.5 ${className}`}>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => set(parseInt(e.target.value, 10))}
        className="w-full min-w-0 bg-transparent focus:outline-none"
      />
      <span className="flex flex-col rounded border border-line">
        <button type="button" aria-label="Increase" onClick={() => set(value + step)} className="px-1 leading-none text-faint hover:text-ink">
          <svg width="8" height="6" viewBox="0 0 10 6"><path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <button type="button" aria-label="Decrease" onClick={() => set(value - step)} className="px-1 leading-none text-faint hover:text-ink">
          <svg width="8" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </span>
    </div>
  );
}

export function TeamTag({ abbr, className = '' }) {
  if (!abbr) return null;
  return (
    <span className={`inline-block rounded border border-line-strong px-1.5 py-px text-2xs font-semibold tracking-wide text-muted ${className}`}>
      {abbr}
    </span>
  );
}

export function Badge({ children, tone = 'warn' }) {
  const tones = {
    warn: 'border-warn/60 text-warn',
    good: 'border-good/60 text-good',
    muted: 'border-line-strong text-muted',
  };
  return <span className={`rounded border px-1.5 py-px text-2xs font-bold uppercase tracking-label ${tones[tone]}`}>{children}</span>;
}

export function Breadcrumbs({ items }) {
  return (
    <nav className="mb-4 flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-2">
          {i > 0 && <span className="text-faint">/</span>}
          {item.href ? (
            <Link href={item.href} className="link text-muted decoration-muted/40">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// Leader card: big value, player, and the runner-up underneath.
export function LeaderCard({ label, value, tone, title, tag, href, sub }) {
  const toneClass = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className="card min-w-0 px-4 py-3.5">
      <div className="label mb-1.5">{label}</div>
      {/* Name and team move together: when they don't fit beside the value, both wrap to the next
          line rather than leaving the team tag on a line of its own. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className={`shrink-0 font-display text-[28px] font-bold leading-none ${toneClass}`}>{value}</span>
        <span className="flex min-w-0 max-w-full items-baseline gap-1.5 whitespace-nowrap">
          {href ? (
            <Link href={href} title={title} className="truncate text-[15px] font-semibold leading-tight hover:underline">
              {title}
            </Link>
          ) : (
            <span title={title} className="truncate text-[15px] font-semibold leading-tight">{title}</span>
          )}
          {tag && <span className="shrink-0 text-2xs font-semibold text-faint">{tag}</span>}
        </span>
      </div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

export function toneOf(value, better = 'high') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return undefined;
  return (value > 0) === (better === 'high') ? 'good' : 'bad';
}

// Two-sided probability bar: the first side's share on the left. Colours default to orange / blue.
export function ProbabilityBar({ left, leftColor = '#f0913f', rightColor = '#4a8ef0', className = '' }) {
  const pct = Math.max(0, Math.min(1, left)) * 100;
  return (
    <div className={`flex h-1.5 gap-px overflow-hidden rounded-full bg-line ${className}`}>
      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: leftColor }} />
      <div className="h-full flex-1" style={{ backgroundColor: rightColor }} />
    </div>
  );
}

// Win-probability bar for a game: each team's abbreviation and chance at its own end (away left,
// home right) in its colour, with an optional caption between them.
export function MatchupBar({ away, home, homeWp, colors, caption, className = '' }) {
  const awayWp = 1 - homeWp;
  const side = (abbr, p, color, align) => (
    <span className={`flex items-center gap-1.5 whitespace-nowrap ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className={p >= 0.5 ? 'font-semibold text-ink' : 'text-muted'}>
        {align === 'right' ? `${Math.round(p * 100)}% ${abbr}` : `${abbr} ${Math.round(p * 100)}%`}
      </span>
    </span>
  );
  return (
    <div className={className}>
      {caption && <div className="mb-1 text-xs text-muted">{caption}</div>}
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        {side(away, awayWp, colors.away, 'left')}
        {side(home, homeWp, colors.home, 'right')}
      </div>
      <ProbabilityBar left={awayWp} leftColor={colors.away} rightColor={colors.home} />
    </div>
  );
}

// Horizontal rank track: a marker placed from worst (left) to best (right).
export function RankTrack({ position, tone }) {
  const color = tone === 'good' ? '#4a8ef0' : tone === 'bad' ? '#f0913f' : '#e7eaee';
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-line">
      <span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-page"
        style={{ left: `${Math.max(0.02, Math.min(0.98, position)) * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}
