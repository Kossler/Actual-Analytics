import { NextUIProvider } from '@nextui-org/react';
import '../utils/ensureNextCssAnchor';
import '../styles/globals.css';
import { useEffect } from 'react';
import Head from 'next/head';

import Footer from '../components/Footer';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    document.body.style.backgroundColor = '#18181b';
    document.body.style.color = '#fafafa';
  }, []);

  return (
    <NextUIProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="dark" style={{ backgroundColor: '#18181b', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          <Component {...pageProps} />
        </div>
        <Footer />
      </div>
    </NextUIProvider>
  );
}

export default MyApp;
