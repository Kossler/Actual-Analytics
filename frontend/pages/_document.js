import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Favicon and Meta Tags */}
          <meta charSet="utf-8" />
          <meta name="description" content="Second Level Analytics - NFL player performance analytics and EPA metrics" />
          <meta name="keywords" content="NFL, analytics, EPA, players, statistics, football, second level analytics, second level" />
          <meta name="author" content="Second Level Analytics" />

          {/* Open Graph for Social Media */}
          <meta property="og:type" content="website" />
          <meta property="og:title" content="Second Level Analytics" />
          <meta property="og:description" content="Convenient and free NFL player statistics and advanced metrics" />
          <meta property="og:site_name" content="Second Level Analytics" />

          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Second Level Analytics" />
          <meta name="twitter:description" content="Convenient and free NFL player statistics and advanced metrics" />

          {/* Favicon */}
          <link rel="icon" href="/favicon.png" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

          {/* Google Fonts */}
          <link
            href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
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
