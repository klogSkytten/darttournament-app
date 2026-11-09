import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  enableTestDatabaseReset: process.env.ENABLE_DATABASE_RESET === 'true'
    && (process.env.NODE_ENV || 'development') !== 'production',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://dartuser:change-me@localhost:5432/darttournament',
};
