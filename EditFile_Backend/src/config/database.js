import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// CockroachDB connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
  process.exit(-1);
});

// Initialize database tables
export const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        original_file_url TEXT,
        output_file_url TEXT,
        original_size BIGINT,
        output_size BIGINT,
        metadata JSONB DEFAULT '{}',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 hour',
        ip_address INET
      )
    `);

    // Create index for cleanup queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)
    `);

    // Create function to auto-update updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Create trigger
    await client.query(`
      DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
      CREATE TRIGGER update_jobs_updated_at
        BEFORE UPDATE ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);

    logger.info('Database tables initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export default pool;
