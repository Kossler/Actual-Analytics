import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Favicon and Meta Tags */}
          <meta charSet="utf-8" />
          <meta name="description" content="Second Level Analytics - Unlocking the Game, One Stat at a Time" />
          <meta name="keywords" content="NFL, analytics, EPA, players, statistics, football, second level analytics, second level" />
          <meta name="author" content="Second Level Analytics" />

          {/* Open Graph for Social Media */}
          <meta property="og:type" content="website" />
          <meta property="og:title" content="Second Level Analytics" />
          <meta property="og:description" content="Unlocking the Game, One Stat at a Time" />
          <meta property="og:site_name" content="Second Level Analytics" />

          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Second Level Analytics" />
          <meta name="twitter:description" content="Unlocking the Game, One Stat at a Time" />

          {/* Favicon */}
          <link rel="icon" href="/32x32.png" />
          <link rel="apple-touch-icon" href="/32x32.png" />

          {/* Google Fonts: Manrope */}
          <link
            href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap"
            rel="stylesheet"
          />

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
}
