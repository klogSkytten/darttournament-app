import express from 'express';
import { config } from './config.js';
import { bootstrapDatabase, database } from './database.js';

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

app.get('/api/tournaments', async (_req, res) => {
  try {
    const result = await database.query(
      'SELECT * FROM tournaments ORDER BY created_at DESC',
    );

    res.status(200).json({
      ok: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Failed to load tournaments:', error);
    res.status(500).json({
      ok: false,
      message: 'Could not load tournaments',
    });
  }
});

app.get('/api/tournaments/:id', async (req, res) => {
  try {
    const result = await database.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Tournament not found',
      });
    }

    return res.status(200).json({
      ok: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Failed to load tournament:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not load tournament',
    });
  }
});

app.post('/api/tournaments', async (req, res) => {
  try {
    const { name, tournamentDate, description, status } = req.body ?? {};

    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        ok: false,
        message: 'Tournament name is required',
      });
    }

    const normalizedStatus = typeof status === 'string' && status.trim() !== '' ? status : 'draft';

    const result = await database.query(
      `
        INSERT INTO tournaments (name, tournament_date, description, status)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [name.trim(), tournamentDate || null, description || null, normalizedStatus],
    );

    return res.status(201).json({
      ok: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Failed to create tournament:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not create tournament',
    });
  }
});

async function startServer(): Promise<void> {
  try {
    await bootstrapDatabase();
    app.listen(config.port, () => {
      console.log(`Backend listening on port ${config.port}`);
    });
  } catch (error) {
    console.error('Backend startup failed during database initialization:', error);
    process.exit(1);
  }
}

startServer();
