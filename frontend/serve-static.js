#!/usr/bin/env node

/**
 * Simple static file server for serving Next.js static export output
 * Used in production to serve the static HTML/CSS/JS from the 'out' directory
 * 
 * SECURITY NOTE: This server uses HTTP (not HTTPS) and is intended for deployment
 * behind a reverse proxy (like Railway/Cloudflare) that provides TLS termination.
 * Do not expose this server directly to the internet without proper security measures.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const OUT_DIR = path.join(__dirname, 'out');

// Simple rate limiting: track requests per IP
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 1000; // 1000 requests per minute per IP

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      requestCounts.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const server = http.createServer((req, res) => {
  // Basic rate limiting
  const clientIP = req.socket.remoteAddress;
  const now = Date.now();
  
  if (clientIP) {
    const clientData = requestCounts.get(clientIP);
    if (clientData) {
      if (now - clientData.timestamp < RATE_LIMIT_WINDOW) {
        if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
          res.writeHead(429, { 'Content-Type': 'text/plain' });
          res.end('Too Many Requests');
          return;
        }
        clientData.count++;
      } else {
        clientData.timestamp = now;
        clientData.count = 1;
      }
    } else {
      requestCounts.set(clientIP, { timestamp: now, count: 1 });
    }
  }
  
  // Parse URL and normalize path
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  // Remove query strings
  urlPath = urlPath.split('?')[0];
  
  let filePath = path.join(OUT_DIR, urlPath);
  
  // Prevent directory traversal
  if (!filePath.startsWith(OUT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // If it's a directory, try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  // Try to read and serve the file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // Try 404.html for not found pages
      const notFoundPath = path.join(OUT_DIR, '404.html');
      fs.readFile(notFoundPath, (err2, notFoundContent) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(notFoundContent || 'Not Found');
      });
      return;
    }

    // Set caching headers
    if (ext === '.html') {
      // Don't cache HTML files (they change on rebuild)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (ext.startsWith('.')) {
      // Cache static assets for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`✓ Static server listening on http://localhost:${PORT}`);
  console.log(`✓ Serving files from: ${OUT_DIR}`);
});
