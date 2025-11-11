require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const playersRouter = require('./routes/players');

// Disable X-Powered-By header for security
app.disable('x-powered-by');

// Configure CORS to allow requests from Cloudflare Pages
const allowedOrigins = [
  'https://actualnflanalytics.com',
  'https://actual-analytics.pages.dev',
  'http://localhost:3000',
  'http://localhost:8080'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or matches Cloudflare Pages preview
    if (allowedOrigins.includes(origin) || origin.endsWith('.pages.dev')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: false
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/players', playersRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend listening on ${port}`));
