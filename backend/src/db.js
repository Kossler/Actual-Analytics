
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Log the DB URL on startup for diagnostics
if (process.env.DATABASE_URL) {
  console.log('[DIAG] Prisma DATABASE_URL:', process.env.DATABASE_URL);
} else {
  console.warn('[DIAG] No DATABASE_URL found in environment!');
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['error', 'warn'],
  errorFormat: 'minimal'
});
module.exports = prisma;
