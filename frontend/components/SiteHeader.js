import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { fetchJson } from '../lib/api';

const NAV = [
  { label: 'Players', href: '/', match: (p) => p === '/' || p.startsWith('/players') || p === '/compare' },
  { label: 'Teams', href: '/teams', match: (p) => p.startsWith('/teams') },
  { label: 'Games', href: '/games', match: (p) => p.startsWith('/games') },
  { label: 'Predictive Models', href: '/predictive-models', match: (p) => p.startsWith('/predictive-models') },
  { label: 'Glossary', href: '/glossary', match: (p) => p.startsWith('/glossary') },
];

export default function SiteHeader() {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Second Level Analytics home">
          <img src="/logo-mark.png" alt="" width={22} height={19} className="h-[19px] w-[22px]" />
          <span className="hidden font-display text-[15px] font-extrabold tracking-wide sm:inline">
            SECOND LEVEL <span className="font-normal text-muted">ANALYTICS</span>
          </span>
        </Link>
        <nav className="-mb-px flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.match(router.pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${
                  active ? 'border-brand font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <SearchBox className="hidden w-72 md:block" />
      </div>
      <div className="px-4 pb-3 md:hidden">
        <SearchBox className="w-full" />
      </div>
    </header>
  );
}

function SearchBox({ className }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ players: [], teams: [] });
  const [active, setActive] = useState(0);

  // "/" focuses search from anywhere, as the placeholder promises.
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      // Only the visible instance (desktop or mobile) takes focus.
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && inputRef.current?.offsetParent) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults({ players: [], teams: [] });
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchJson(`/api/search?q=${encodeURIComponent(term)}`)
        .then((data) => {
          if (!cancelled) {
            setResults(data);
            setActive(0);
          }
        })
        .catch(() => {});
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const items = [
    ...results.teams.map((t) => ({ key: `t-${t.abbr}`, href: `/teams/${t.abbr}`, title: t.name, meta: 'Team' })),
    ...results.players.map((p) => ({
      key: `p-${p.gsis_id}`,
      href: `/players/${p.gsis_id}`,
      title: p.display_name,
      meta: [p.position, p.latest_team].filter(Boolean).join(' · '),
    })),
  ];

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    router.push(item.href);
  };

  return (
    <div className={`relative shrink-0 ${className}`}>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm focus-within:border-line-strong">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-faint" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, items.length - 1));
            else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
            else if (e.key === 'Enter') go(items[active]);
            else if (e.key === 'Escape') inputRef.current?.blur();
            else return;
            e.preventDefault();
          }}
          placeholder="Search players, teams…"
          className="w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
          aria-label="Search players and teams"
        />
        <kbd className="rounded border border-line px-1.5 text-2xs text-faint">/</kbd>
      </label>
      {open && items.length > 0 && (
        <ul className="absolute right-0 mt-1.5 w-full overflow-hidden rounded-lg border border-line-strong bg-raised py-1 shadow-2xl">
          {items.map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === active ? 'bg-line' : ''}`}
              >
                <span className="truncate font-medium">{item.title}</span>
                <span className="shrink-0 text-xs text-faint">{item.meta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
