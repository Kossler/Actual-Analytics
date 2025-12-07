/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    runtime: 'edge', // Enables edge runtime for SSR
  },
};
module.exports = nextConfig;