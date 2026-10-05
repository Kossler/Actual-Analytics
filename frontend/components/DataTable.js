import { formatValue } from '../lib/format';
import { metricValue, shadeStyle } from '../lib/metrics';

// columns: [{ key, short, label, group, format, description, better, value?(row), render?(row) }]
// lead:    { header, render(row, index), className } — the sticky first column (player/team/game)
export default function DataTable({
  columns,
  rows,
  lead,
  rowKey,
  sortKey,
  sortDir = 'desc',
  onSort,
  shading = {},
  footerRows = [],
  rowClassName,
  dense = false,
  caption,
}) {
  const hasGroups = columns.some((c) => c.group);
  const groupStarts = new Set();
  const groups = [];
  columns.forEach((c, i) => {
    const prev = columns[i - 1];
    if (!prev || prev.group !== c.group) {
      groupStarts.add(c.key);
      groups.push({ label: c.group, span: 1 });
    } else {
      groups[groups.length - 1].span += 1;
    }
  });

  const cellValue = (col, row) => (col.value ? col.value(row) : metricValue(col.key, row));
  const cellPad = dense ? 'py-2' : 'py-[11px]';

  const renderCell = (col, row, isFooter) => {
    const v = cellValue(col, row);
    const style = shading[col.key] ? shadeStyle(v, shading[col.key], col.better) : undefined;
    const sorted = col.key === sortKey;
    return (
      <td
        key={col.key}
        style={style}
        className={`num whitespace-nowrap px-3 text-right ${cellPad} ${groupStarts.has(col.key) && hasGroups ? 'border-l border-line' : ''} ${
          sorted && !style ? 'bg-white/[0.035]' : ''
        } ${sorted || isFooter ? 'font-semibold text-ink' : 'text-[#d4d8de]'}`}
      >
        {col.render ? col.render(row) : formatValue(v, col.format)}
      </td>
    );
  };

  return (
    <div className="card overflow-hidden">
      {caption}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            {hasGroups && (
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 border-r border-line bg-surface" />
                {groups.map((g, i) => (
                  <th key={`${g.label}-${i}`} colSpan={g.span} className={`label px-3 py-2.5 text-center font-semibold ${i ? 'border-l border-line' : ''}`}>
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="border-b border-line">
              <th className={`label sticky left-0 z-10 border-r border-line bg-surface px-4 py-3 text-left ${lead.className || ''}`}>{lead.header}</th>
              {columns.map((col) => {
                const sorted = col.key === sortKey;
                const sortable = !!onSort && col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`group relative whitespace-nowrap px-3 py-3 text-right text-2xs font-semibold uppercase tracking-label ${
                      groupStarts.has(col.key) && hasGroups ? 'border-l border-line' : ''
                    } ${sorted ? 'bg-white/[0.035] text-ink shadow-[inset_0_-2px_0_#ed1c33]' : 'text-faint'}`}
                  >
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={() => sortable && onSort(col.key)}
                      className={`uppercase ${sortable ? 'cursor-pointer hover:text-ink' : 'cursor-default'}`}
                    >
                      {col.short || col.label}
                      {sorted && <span className="ml-1 text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                    {col.description && (
                      <span className="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-60 whitespace-normal rounded-lg border border-line-strong bg-raised p-3 text-left text-xs font-normal normal-case tracking-normal text-muted shadow-2xl group-hover:block">
                        <span className="mb-1 block font-semibold text-ink">{col.label}</span>
                        {col.description}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={rowKey(row)} className={`border-b border-line/70 last:border-b-0 hover:bg-white/[0.02] ${rowClassName ? rowClassName(row) : ''}`}>
                <td className={`sticky left-0 z-[5] border-r border-line bg-surface px-4 ${cellPad}`}>{lead.render(row, i)}</td>
                {columns.map((col) => renderCell(col, row, false))}
              </tr>
            ))}
            {footerRows.map((row, i) => (
              <tr key={`footer-${i}`} className="border-t border-line-strong bg-white/[0.025]">
                <td className={`sticky left-0 z-[5] border-r border-line bg-[#151a21] px-4 font-semibold ${cellPad}`}>{lead.render(row, -1)}</td>
                {columns.map((col) => renderCell(col, row, true))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sorting helper shared by tables: nulls always sink to the bottom.
export function sortRows(rows, valueOf, dir = 'desc') {
  return [...rows].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    const aNull = av === null || av === undefined || Number.isNaN(av);
    const bNull = bv === null || bv === undefined || Number.isNaN(bv);
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });
}
