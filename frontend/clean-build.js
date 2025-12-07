#!/usr/bin/env node

/**
 * Clean build script to remove cache artifacts after Next.js build
 * Cloudflare Pages has a 25 MiB per file limit, so we remove cache artifacts
 */

const fs = require('fs');
const path = require('path');

// Only remove .next/cache to avoid deleting SSR output needed for Cloudflare Pages Functions
const cacheDir = '.next/cache';
const fullPath = path.resolve(cacheDir);
if (fs.existsSync(fullPath)) {
  try {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`✓ Removed: ${cacheDir}`);
  } catch (err) {
    console.warn(`⚠ Could not remove ${cacheDir}: ${err.message}`);
  }
}
