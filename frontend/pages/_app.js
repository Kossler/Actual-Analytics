import { NextUIProvider } from '@nextui-org/react';
import '../styles/globals.css';
import { useEffect } from 'react';

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
      <div className="dark" style={{ backgroundColor: '#18181b', minHeight: '100vh' }}>
        <Component {...pageProps} />
      </div>
    </NextUIProvider>
  );
}

export default MyApp;
