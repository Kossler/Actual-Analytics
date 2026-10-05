import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="Second Level Analytics: NFL player, team and game analytics built on EPA, success rate and our own predictive models." />
        <meta name="theme-color" content="#13192A" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Second Level Analytics" />
        <meta property="og:description" content="Unlocking the Game, One Stat at a Time" />
        <meta property="og:site_name" content="Second Level Analytics" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/32x32.png" />
        <link rel="apple-touch-icon" href="/32x32.png" />
        {/* Anchor used by Next's dev CSS injector (next-style-loader). */}
        <noscript id="__next_css__DO_NOT_USE__" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
