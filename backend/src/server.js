
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
// Removed cluster/worker logic for Railway stability

const playersRouter = require('./routes/players');
const apiRouter = require('./routes/api');

const app = express();
// Disable X-Powered-By header for security
app.disable('x-powered-by');
app.use(compression());

// Configure CORS to explicitly allow production and local origins
const corsOptions = {
  origin: [
    'https://secondlevelanalytics.com',
    'https://actual-analytics.pages.dev',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080'
  ],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});


app.use('/api/players', playersRouter);
app.use('/', apiRouter);


const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server listening on ${port}`));
