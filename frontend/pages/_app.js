import '../utils/ensureNextCssAnchor';
import '../styles/globals.css';
import Head from 'next/head';
import { Manrope } from 'next/font/google';
import Layout from '../components/Layout';

// The brand typeface, Light (300) to ExtraBold (800).
const manrope = Manrope({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800'], variable: '--font-manrope', display: 'swap' });

export default function App({ Component, pageProps }) {
  return (
    <div className={`${manrope.variable} font-sans`}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Second Level Analytics</title>
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </div>
  );
}
