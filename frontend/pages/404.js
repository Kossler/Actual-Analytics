import Head from 'next/head';
import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Not found · Second Level Analytics</title>
      </Head>
      <div className="mx-auto max-w-md py-24 text-center">
        <div className="label mb-2">404</div>
        <h1 className="text-3xl font-extrabold">We couldn’t find that page</h1>
        <p className="mt-3 text-sm text-muted">The player, team or game may not exist, or the link is out of date.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn btn-primary">Player leaderboards</Link>
          <Link href="/teams" className="btn">Team rankings</Link>
        </div>
      </div>
    </>
  );
}
