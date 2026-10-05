import Link from 'next/link';
import SiteHeader from './SiteHeader';

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-16 pt-7 sm:px-8">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-muted">Unlocking the Game, One Stat at a Time</p>
            <p>Data from nflverse play-by-play, Next Gen Stats and Over The Cap. Updated as new data is published.</p>
          </div>
          <nav className="flex gap-4">
            <Link href="/glossary" className="hover:text-muted">Glossary</Link>
            <Link href="/predictive-models" className="hover:text-muted">How the models work</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
