import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicon and Meta Tags */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Actual Analytics - NFL player performance analytics and EPA metrics" />
        <meta name="keywords" content="NFL, analytics, EPA, players, statistics, football" />
        <meta name="author" content="Actual Analytics" />
        
        {/* Open Graph for Social Media */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Actual NFL Analytics" />
        <meta property="og:description" content="Conventient and free NFL player analytics and advanced metrics" />
        <meta property="og:site_name" content="Actual NFL Analytics" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Actual Analytics" />
        <meta name="twitter:description" content="Conventient and free NFL player analytics and advanced metrics" />
        
        {/* Favicon */}
        <link rel="icon" href="/Actual NFL Analytics icon.png" />
        <link rel="apple-touch-icon" href="/Actual NFL Analytics icon.png" />
        
        {/* Google Fonts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
