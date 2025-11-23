require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
	datasources: {
		db: {
			url: process.env.DATABASE_URL
		}
	},
	log: ['error', 'warn'],
	errorFormat: 'minimal',
	connection_limit: 10 // Use up to 10 connections for pool
});
module.exports = prisma;
