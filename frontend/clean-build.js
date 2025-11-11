#!/usr/bin/env node

/**
 * Clean build script to remove cache artifacts after Next.js build
 * Cloudflare Pages has a 25 MiB per file limit, so we remove cache artifacts
 */

const fs = require('fs');
const path = require('path');

// Directories that should not be deployed
const dirsToRemove = [
  '.next/cache',
  '.next/server',    // Server files not needed for static export
  'cache',
  '.vercel',
  '.swc',
  '.turbo'
];

// Remove large directories
dirsToRemove.forEach(dir => {
  const fullPath = path.resolve(dir);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`✓ Removed: ${dir}`);
    } catch (err) {
      console.warn(`⚠ Could not remove ${dir}: ${err.message}`);
    }
  }
});

// Report build output size
const outDir = 'out';
if (fs.existsSync(outDir)) {
  const getSize = (filepath) => {
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      let size = 0;
      const files = fs.readdirSync(filepath);
      files.forEach(file => {
        size += getSize(path.join(filepath, file));
      });
      return size;
    }
    return stats.size;
  };

  try {
    const totalSize = getSize(outDir);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`✓ Static export size: ${sizeMB} MiB`);
  } catch (err) {
    console.log('✓ Build cleanup complete');
  }
}
