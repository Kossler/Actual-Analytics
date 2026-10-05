import Head from 'next/head';
import { PageHeader } from '../components/ui';
import { METRICS, TEAM_METRICS } from '../lib/metrics';

const CONCEPTS = [
  {
    key: 'epa',
    label: 'Expected points added (EPA)',
    description:
      'How much a play changed the offense’s expected points, given down, distance, field position and clock. A 6-yard completion on 3rd-and-5 is worth far more than the same gain on 3rd-and-12; EPA captures that difference. Values come from nflverse’s expected-points model.',
  },
  { key: 'success', label: 'Success rate', description: 'Share of plays with positive EPA — a measure of consistency rather than explosiveness.' },
  { key: 'per-play', label: 'Per play vs. total', description: 'Totals reward volume; per-play rates show efficiency. Leaderboards show both and let you set a minimum volume so small samples don’t dominate.' },
  { key: 'qualifying', label: 'Qualifying players', description: 'Leaderboard ranks, shading and averages only use players above the minimum volume (by default about 22 pass attempts, 10 carries, or 4–5 targets per week).' },
  { key: 'shading', label: 'Table shading', description: 'Blue cells are better than the qualifying group’s average, orange worse; the stronger the colour, the further from average.' },
  { key: 'ngs', label: 'Next Gen Stats', description: 'The NFL’s player-tracking data (from 2016): separation, time to throw, rush yards over expected and more. The NFL only publishes weekly numbers for players above a volume threshold.' },
  { key: 'brier', label: 'Brier score', description: 'Average squared error of a probability forecast: 0 is perfect, 0.25 is a coin flip. Lower is better.' },
  { key: 'logloss', label: 'Log loss', description: 'Like the Brier score but punishes confident misses more heavily. 0.693 is a coin flip. Lower is better.' },
  { key: 'calibration', label: 'Calibration', description: 'Whether forecasts mean what they say: teams given 70% should win about 70% of the time.' },
  { key: 'playoff-odds', label: 'Playoff odds', description: 'Share of 10,000 simulated seasons in which a team makes the playoffs, using the game model for every remaining game and random tie-breaks.' },
];

export default function Glossary() {
  const groups = {};
  for (const [key, m] of Object.entries(METRICS)) {
    if (!m.description) continue;
    (groups[m.group] ||= []).push({ key, ...m });
  }
  const sections = [
    { title: 'Concepts', items: CONCEPTS },
    ...Object.entries(groups).map(([title, items]) => ({ title, items })),
    { title: 'Team', items: Object.entries(TEAM_METRICS).map(([key, m]) => ({ key: `team-${key}`, ...m })) },
  ];
  return (
    <>
      <Head>
        <title>Glossary · Second Level Analytics</title>
      </Head>
      <PageHeader eyebrow="Reference" title="Glossary" />
      <nav className="mb-6 flex flex-wrap gap-2">
        {sections.map((s) => (
          <a key={s.title} href={`#${s.title.toLowerCase()}`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-ink">
            {s.title}
          </a>
        ))}
      </nav>
      <div className="space-y-8">
        {sections.map((s) => (
          <section key={s.title} id={s.title.toLowerCase()} className="scroll-mt-20">
            <h2 className="mb-3 font-sans text-sub2 font-bold">{s.title}</h2>
            <dl className="card divide-y divide-line">
              {s.items.map((m) => (
                <div key={m.key} id={m.key} className="grid scroll-mt-20 gap-1 px-5 py-3.5 sm:grid-cols-[260px_1fr] sm:gap-6">
                  <dt className="font-semibold">
                    {m.label}
                    {m.short && m.short !== m.label && <span className="ml-2 text-2xs font-semibold tracking-label text-faint">{m.short}</span>}
                  </dt>
                  <dd className="text-sm leading-relaxed text-muted">{m.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
