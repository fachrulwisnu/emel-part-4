import pg from 'pg';

const { Pool } = pg;

let pgPool: pg.Pool | null = null;
let currentConnectionString: string | null = null;

/**
 * Initializes and auto-creates tables if not present
 */
async function initPostgresTables(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(255) UNIQUE NOT NULL,
        subject TEXT,
        sender TEXT,
        receiver TEXT,
        date TEXT,
        body_text TEXT,
        html_body TEXT,
        tags TEXT,
        category VARCHAR(100),
        sub_category VARCHAR(100),
        folder_parent VARCHAR(100),
        folder_child VARCHAR(100),
        attachments TEXT,
        api_workflow_status VARCHAR(50),
        api_workflow_log TEXT,
        is_read INTEGER DEFAULT 0,
        tag_type VARCHAR(50),
        summary TEXT,
        action_required INTEGER DEFAULT 0,
        suggested_tag VARCHAR(100),
        is_important INTEGER DEFAULT 0,
        urgency_level VARCHAR(50),
        suggested_folder_parent VARCHAR(100),
        suggested_folder_child VARCHAR(100),
        is_cit_order INTEGER DEFAULT 0,
        cit_type VARCHAR(50),
        suggested_bank VARCHAR(100),
        extracted_notes TEXT,
        currency VARCHAR(10) DEFAULT 'IDR',
        denomination_suggestion INTEGER,
        total_amount NUMERIC,
        ai_status VARCHAR(50) DEFAULT 'PENDING',
        is_summarized INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS custom_filters (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        match_from TEXT,
        match_subject TEXT,
        match_body TEXT,
        action_parent VARCHAR(100),
        action_child VARCHAR(100),
        trigger_api INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS email_analysis (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(255) UNIQUE NOT NULL,
        folder VARCHAR(100),
        sub_folder VARCHAR(100),
        tags TEXT,
        summary_email TEXT,
        summary_attachments TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wa_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        creds JSONB,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
      CREATE INDEX IF NOT EXISTS idx_email_analysis_msg_id ON email_analysis(message_id);
      CREATE INDEX IF NOT EXISTS idx_wa_sessions_id ON wa_sessions(session_id);
    `);
  } catch (err) {
    console.error('[PostgreSQL] Error initializing database tables:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gets or initializes the PostgreSQL Pool connection for the given connection string
 */
export async function getPostgresPool(connectionString: string): Promise<pg.Pool> {
  // If connection string changed or pool doesn't exist, recreate pool
  if (!pgPool || currentConnectionString !== connectionString) {
    if (pgPool) {
      console.log('[PostgreSQL] Closing previous connection pool...');
      await pgPool.end().catch(err => console.error('[PostgreSQL] Error ending pool:', err));
    }

    console.log('[PostgreSQL] Connecting to PostgreSQL database...');
    pgPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000
    });

    currentConnectionString = connectionString;
    await initPostgresTables(pgPool);
    console.log('[PostgreSQL] Connected and tables verified successfully.');
  }

  return pgPool;
}

/**
 * Safely closes the active PostgreSQL pool
 */
export async function closePostgresPool(): Promise<void> {
  if (pgPool) {
    console.log('[PostgreSQL] Gracefully closing PostgreSQL connection pool...');
    await pgPool.end().catch(err => console.error('[PostgreSQL] Error closing pool:', err));
    pgPool = null;
    currentConnectionString = null;
  }
}
