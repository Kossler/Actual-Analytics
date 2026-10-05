import '../utils/ensureNextCssAnchor';
import '../styles/globals.css';
import Head from 'next/head';
import { Archivo, Inter } from 'next/font/google';
import Layout from '../components/Layout';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export default function App({ Component, pageProps }) {
  return (
    <div className={`${archivo.variable} ${inter.variable} font-sans`}>
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
