import { Pool } from 'pg';
import { config } from './config.js';

export const database = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 5_000,
});

database.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});