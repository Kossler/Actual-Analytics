/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  // Export as static site for Cloudflare Pages
  output: 'export',
  // Disable webpack cache completely to prevent large cache files
  webpack: (config, { dev, isServer }) => {
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;
