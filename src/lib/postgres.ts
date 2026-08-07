import pg from 'pg';

const { Pool } = pg;

let pgPool: pg.Pool | null = null;
let currentConnectionString: string | null = null;

/**
 * Inisialisasi skema dan pembuatan otomatis tabel-tabel PostgreSQL jika belum tersedia.
 *
 * [MIGRATION NOTE]: Sebelumnya sistem menggunakan MongoDB dengan skema Mongoose terpisah.
 * Seluruh entitas (tenants, users, emails, mail_configs, system_logs, dll.) kini dimigrasikan
 * secara penuh ke skema terpusat PostgreSQL dengan penanganan relasi multi-tenant (ON DELETE CASCADE)
 * dan kolom JSONB untuk performa optimal.
 *
 * @param {pg.Pool} pool - Connection Pool PostgreSQL aktif.
 * @returns {Promise<void>}
 */
async function initPostgresTables(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS public.tenants (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          ai_primary_model TEXT DEFAULT 'Custom AI Core',
          ai_fallback_model TEXT DEFAULT 'Nemotron 3 Super 120B',
          ai_models JSONB DEFAULT '["Custom AI Core", "Nemotron 3 Super 120B"]'::jsonb,
          feature_individual_parsing BOOLEAN DEFAULT FALSE,
          feature_bulk_summary BOOLEAN DEFAULT FALSE,
          pop3_host TEXT DEFAULT '',
          pop3_port INTEGER DEFAULT 110,
          pop3_user TEXT DEFAULT '',
          pop3_pass TEXT DEFAULT '',
          wa_phone TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      -- Ensure new columns exist on existing tables if created previously
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS ai_models JSONB DEFAULT '["Custom AI Core", "Nemotron 3 Super 120B"]'::jsonb;
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS pop3_host TEXT DEFAULT '';
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS pop3_port INTEGER DEFAULT 110;
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS pop3_user TEXT DEFAULT '';
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS pop3_pass TEXT DEFAULT '';
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS wa_phone TEXT DEFAULT '';
      ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"dashboard": true, "cit_dispatch": true, "daily_summary": true, "mail_wa_setup": true, "dynamic_filters": true}'::jsonb;

      CREATE TABLE IF NOT EXISTS public.users (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'TENANT_ADMIN')),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.emails (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          message_id TEXT UNIQUE NOT NULL,
          uid TEXT,
          subject TEXT,
          sender TEXT,
          receiver TEXT,
          date TIMESTAMPTZ,
          body_text TEXT,
          html_body TEXT,
          tags JSONB DEFAULT '[]'::jsonb,
          category TEXT,
          sub_category TEXT,
          folder_parent TEXT,
          folder_child TEXT,
          api_workflow_status TEXT,
          api_workflow_log TEXT,
          attachments JSONB DEFAULT '[]'::jsonb,
          is_read BOOLEAN DEFAULT FALSE,
          tag_type TEXT,
          summary TEXT,
          action_required BOOLEAN DEFAULT FALSE,
          suggested_tag TEXT,
          is_important BOOLEAN DEFAULT FALSE,
          urgency_level TEXT,
          suggested_folder_parent TEXT,
          suggested_folder_child TEXT,
          is_cit_order BOOLEAN DEFAULT FALSE,
          cit_type TEXT,
          suggested_bank TEXT,
          extracted_notes TEXT,
          currency TEXT DEFAULT 'IDR',
          denomination_suggestion BIGINT,
          total_amount BIGINT,
          denomination_breakdown JSONB DEFAULT '{}'::jsonb,
          ai_status TEXT DEFAULT 'PENDING',
          is_summarized BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS target_tickets INTEGER DEFAULT 1;
      ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS processed_tickets INTEGER DEFAULT 0;
      ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'PENDING';
      ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS source_email TEXT DEFAULT '';
      ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS denomination_breakdown JSONB DEFAULT '{}'::jsonb;

      CREATE TABLE IF NOT EXISTS public.mail_configs (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          email_address TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER DEFAULT 995,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.cit_orders (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          message_id TEXT NOT NULL,
          ticket_index INTEGER DEFAULT 1,
          order_date DATE,
          branch_name TEXT,
          client_name TEXT,
          trip_type TEXT,
          cycle_type TEXT,
          currency TEXT DEFAULT 'IDR',
          total_amount NUMERIC,
          items JSONB DEFAULT '[]'::jsonb,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_emails_message_id ON public.emails(message_id);
      CREATE INDEX IF NOT EXISTS idx_emails_date ON public.emails(date DESC);

      CREATE TABLE IF NOT EXISTS public.custom_filters (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          name TEXT,
          match_from TEXT,
          match_subject TEXT,
          match_body TEXT,
          action_parent TEXT,
          action_child TEXT,
          trigger_api INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.email_analysis (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          message_id TEXT UNIQUE NOT NULL,
          folder TEXT,
          sub_folder TEXT,
          tags JSONB DEFAULT '[]'::jsonb,
          summary_email TEXT,
          summary_attachments JSONB DEFAULT '[]'::jsonb,
          attachment_summary JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.wa_sessions (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          session_id TEXT UNIQUE NOT NULL,
          creds JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.daily_summaries (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          summary_date DATE NOT NULL,
          content_text TEXT NOT NULL,
          content_text_short TEXT,
          total_emails_processed INTEGER DEFAULT 0,
          last_email_id_processed INTEGER DEFAULT 0,
          is_sent_to_wa BOOLEAN DEFAULT FALSE,
          source_email_ids JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE public.daily_summaries ADD COLUMN IF NOT EXISTS content_text_short TEXT;
      ALTER TABLE public.daily_summaries DROP CONSTRAINT IF EXISTS unique_tenant_date;
      ALTER TABLE public.daily_summaries DROP CONSTRAINT IF EXISTS daily_summaries_tenant_id_summary_date_key;
      CREATE INDEX IF NOT EXISTS idx_daily_summaries_tenant_date ON public.daily_summaries(tenant_id, summary_date);
      ALTER TABLE public.daily_summaries ADD COLUMN IF NOT EXISTS total_emails_processed INTEGER DEFAULT 0;
      ALTER TABLE public.daily_summaries ADD COLUMN IF NOT EXISTS last_email_id_processed INTEGER DEFAULT 0;
      ALTER TABLE public.daily_summaries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE public.daily_summaries ADD COLUMN IF NOT EXISTS source_email_ids JSONB DEFAULT '[]'::jsonb;

      CREATE TABLE IF NOT EXISTS public.dynamic_filters (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
          emails TEXT NOT NULL,
          region TEXT NOT NULL,
          branch TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.system_logs (
          id SERIAL PRIMARY KEY,
          tenant_id INT NOT NULL,
          task_type VARCHAR(100) NOT NULL,
          status VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_id ON public.system_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);

    `);

    // Seed default tenant and users ONLY if tenants table is empty
    const tenantCountRes = await client.query('SELECT COUNT(*)::int AS count FROM public.tenants;');
    if (tenantCountRes.rows[0].count === 0) {
      console.log('[PostgreSQL] Database is empty. Seeding initial default tenant (COS)...');
      await client.query(`
        INSERT INTO public.tenants (name, ai_primary_model, ai_fallback_model, feature_individual_parsing, feature_bulk_summary, permissions) 
        VALUES ('COS', 'Custom AI Core', 'Nemotron 3 Super 120B', TRUE, FALSE, '{"dashboard": true, "cit_dispatch": true, "daily_summary": true, "mail_wa_setup": true, "dynamic_filters": true}'::jsonb);
      `);
    }

    const userCountRes = await client.query('SELECT COUNT(*)::int AS count FROM public.users;');
    if (userCountRes.rows[0].count === 0) {
      console.log('[PostgreSQL] Users table is empty. Seeding Super Admin (fachrul) and Tenant Admin (cos)...');
      await client.query(`
        INSERT INTO public.users (tenant_id, email, password_hash, role) 
        VALUES 
            (NULL, 'fachrul', crypt('bosskubabi', gen_salt('bf')), 'SUPER_ADMIN'),
            ((SELECT id FROM public.tenants WHERE LOWER(name) = 'cos' LIMIT 1), 'cos', crypt('12345678', gen_salt('bf')), 'TENANT_ADMIN');
      `);
    }
  } catch (err) {
    console.error('[PostgreSQL] Error initializing database tables:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mengambil atau menginisialisasi PostgreSQL Pool connection berdasarkan connection string.
 *
 * [MIGRATION NOTE]: Menggantikan fungsi inisialisasi `mongoose.connect()` dari arsitektur NoSQL sebelumnya.
 * Menggunakan pg.Pool terkelola dengan batas timeout dan otomatisasi verifikasi tabel.
 *
 * @param {string} connectionString - URI PostgreSQL untuk koneksi database.
 * @returns {Promise<pg.Pool>} Mengembalikan instance pg.Pool yang siap dipakai.
 */
export async function getPostgresPool(connectionString: string): Promise<pg.Pool> {
  const effectiveConnString = (connectionString && connectionString.trim()) || (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) || '';
  if (!effectiveConnString) {
    throw new Error('PostgreSQL connection string is empty');
  }

  // If connection string changed or pool doesn't exist, recreate pool
  if (!pgPool || currentConnectionString !== effectiveConnString) {
    if (pgPool) {
      console.log('[PostgreSQL] Closing previous connection pool...');
      await pgPool.end().catch(err => console.error('[PostgreSQL] Error ending pool:', err));
    }

    console.log('[PostgreSQL] Connecting to PostgreSQL database...');
    pgPool = new Pool({
      connectionString: effectiveConnString,
      max: 50,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      maxUses: 7500
    });

    // Handle unexpected background connection errors to prevent process crash
    pgPool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Error]: Connection error on idle client:', err.message || err);
    });

    currentConnectionString = effectiveConnString;
    await initPostgresTables(pgPool);
    console.log('[PostgreSQL] Connected and tables verified successfully.');
  }

  return pgPool;
}

/**
 * Menutup secara aman (Graceful Shutdown) instance PostgreSQL Connection Pool aktif.
 *
 * @returns {Promise<void>}
 */
export async function closePostgresPool(): Promise<void> {
  if (pgPool) {
    console.log('[PostgreSQL] Gracefully closing PostgreSQL connection pool...');
    await pgPool.end().catch(err => console.error('[PostgreSQL] Error closing pool:', err));
    pgPool = null;
    currentConnectionString = null;
  }
}
