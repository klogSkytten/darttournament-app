import express from 'express';
import { config } from './config.js';
import { database } from './database.js';

const app = express();

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ready', async (_req, res) => {
  try {
    await database.query('SELECT 1');
    res.status(200).json({
      ok: true,
      status: 'ready',
      checks: { database: 'ok' },
      message: 'Backend and database connectivity OK',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database readiness check failed:', error);
    res.status(503).json({
      ok: false,
      status: 'not_ready',
      checks: { database: 'error' },
      message: 'Backend is reachable, but the database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'darttournament-backend',
    version: '0.1.0',
    status: 'running',
  });
});

app.get('/api/connectivity', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'backend',
    status: 'ok',
    statusCode: 200,
    message: 'Backend connectivity OK',
    timestamp: new Date().toISOString(),
    backendUrl: `${req.protocol}://${req.get('host')}/api/connectivity`,
  });
});

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});
