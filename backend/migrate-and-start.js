#!/usr/bin/env node
/**
 * Migration and startup script
 * Runs Prisma migrations before starting the server
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendDir = __dirname;

console.log('[Migration] Backend directory:', backendDir);
console.log('[Migration] Current working directory:', process.cwd());

// Verify Prisma CLI exists
const prismaCli = path.join(backendDir, 'node_modules', '.bin', 'prisma');
console.log('[Migration] Checking Prisma CLI at:', prismaCli);
console.log('[Migration] Prisma CLI exists:', fs.existsSync(prismaCli));

// Run migration
console.log('[Migration] Running prisma migrate deploy...');
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

console.log('[Migration] Migration exit code:', result.status);

if (result.status !== 0 && result.status !== null) {
  console.error('[Migration] Migration failed with exit code:', result.status);
  // Don't exit - try to start server anyway
  console.warn('[Migration] Attempting to start server anyway...');
}

console.log('[Migration] Migrations check complete');
console.log('[Server] Starting server...');
require('./src/server.js');
