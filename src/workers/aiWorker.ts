/**
 * =========================================================================
 * REDIS / BULLMQ WORKER SERVICE: AI EMAIL PROCESSING
 * =========================================================================
 * 
 * FLOW:
 * 1. Worker mendengarkan antrean Redis BullMQ (`email-ai-queue`).
 * 2. Mengambil job payload { email_id, tenant_id }.
 * 3. Memverifikasi keberadaan email dan konfigurasi model AI milik tenant di PostgreSQL/MongoDB.
 * 4. Mengirimkan teks email ke Multi-LLM Routing Engine untuk ekstraksi tiket CIT/ATM & tagging.
 * 5. Mengupdate status email di DB menjadi 'COMPLETED' (jika sukses) atau 'FAILED' (jika gagal).
 * 6. Jika terjadi error/timeout LLM, BullMQ melakukan auto-retry otomatis dengan exponential backoff (max 3x).
 */

import { Worker, QueueEvents } from 'bullmq';
import { redisConnection, QUEUE_NAME, emailQueue } from '../config/queue';
import { dbGetEmailByMessageId, analyzeEmail, dbUpdateEmailFields } from '../database-service';
import { dbGetTenantById } from '../services/dbManager';

console.log('[Worker Service] Initializing Email AI Worker...');

/**
 * BullMQ Worker instance handling asynchronous email processing
 */
export const aiWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { email_id, tenant_id } = job.data || {};
    if (!email_id) {
      throw new Error('Invalid job payload: missing email_id');
    }

    const emailStr = String(email_id).trim();
    const isNumericId = /^\d+$/.test(emailStr);

    let email = await dbGetEmailByMessageId(emailStr);

    // Direct PostgreSQL lookup if dbGetEmailByMessageId returned null
    if (!email) {
      try {
        const { getDatabaseConfig } = await import('../utils/configManager');
        const { getPostgresPool } = await import('../lib/postgres');
        const config = await getDatabaseConfig();
        const pgConnString = config.connections?.postgres || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/email_ticketing";
        const pool = await getPostgresPool(pgConnString);

        let res;
        if (isNumericId) {
          res = await pool.query('SELECT * FROM public.emails WHERE id = $1 LIMIT 1', [parseInt(emailStr, 10)]);
          if (res.rows.length === 0) {
            res = await pool.query('SELECT * FROM public.emails WHERE message_id = $1 LIMIT 1', [emailStr]);
          }
        } else {
          // String hash message_id query strictly using message_id column
          res = await pool.query('SELECT * FROM public.emails WHERE message_id = $1 LIMIT 1', [emailStr]);
        }

        if (res.rows.length > 0) {
          const row = res.rows[0];
          email = {
            id: row.id,
            message_id: row.message_id,
            subject: row.subject || '',
            sender: row.sender || row.sender_email || '',
            receiver: row.receiver || '',
            date: row.date || '',
            body_text: row.body_text || row.body || '',
            html_body: row.html_body || row.body_html || '',
            tags: typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []),
            category: row.category || '',
            sub_category: row.sub_category || '',
            folder_parent: row.folder_parent || '',
            folder_child: row.folder_child || '',
            api_workflow_status: row.api_workflow_status || 'none',
            api_workflow_log: row.api_workflow_log || '',
            attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []),
            is_read: row.is_read === true || row.is_read === 1,
            tag_type: row.tag_type || '',
            summary: row.summary || '',
            action_required: row.action_required === true || row.action_required === 1,
            suggested_tag: row.suggested_tag || '',
            is_important: row.is_important === true || row.is_important === 1,
            urgency_level: row.urgency_level || 'Routine',
            suggested_folder_parent: row.suggested_folder_parent || '',
            suggested_folder_child: row.suggested_folder_child || '',
            is_cit_order: row.is_cit_order === true || row.is_cit_order === 1,
            cit_type: row.cit_type || 'None',
            suggested_bank: row.suggested_bank || '',
            extracted_notes: row.extracted_notes || '',
            currency: row.currency || 'IDR',
            denomination_suggestion: row.denomination_suggestion !== undefined && row.denomination_suggestion !== null ? Number(row.denomination_suggestion) : undefined,
            total_amount: row.total_amount !== undefined && row.total_amount !== null ? Number(row.total_amount) : undefined,
            ai_status: row.ai_status || 'PENDING',
            is_summarized: row.is_summarized === 1 || row.is_summarized === true || row.ai_status === 'COMPLETED' || (!!row.summary && row.summary.trim().length > 0)
          };
        }
      } catch (dbErr) {
        console.warn('[Worker Service] Direct DB Query Warning:', dbErr);
      }
    }

    if (tenant_id) {
      await dbGetTenantById(Number(tenant_id)).catch(() => null);
    }

    if (!email) {
      console.warn(`[Worker Warning] Email with ID ${email_id} not found in database. Retrying queue...`);
      // Throw error so BullMQ auto-retries in 2 seconds (anti-race condition)
      throw new Error(`Email with ID ${email_id} not found in database (pending DB commit).`);
    }

    // Step B: Eksekusi LLM Analysis & update status ke 'COMPLETED' / 'FAILED'
    try {
      const targetMessageId = email.message_id || emailStr;
      await analyzeEmail(targetMessageId);
      console.log(`[Queue: Completed] Email ID ${email_id} selesai diproses.`);
      return { success: true, email_id: targetMessageId };
    } catch (err: any) {
      console.error(`[Worker Exception] Error processing Email ID ${email_id}:`, err.message || err);
      // Tandai status 'FAILED' di database jika gagal
      await dbUpdateEmailFields(email.message_id || emailStr, { ai_status: 'FAILED' }).catch(() => {});
      throw err; // Trigger BullMQ auto-retry
    }
  },
  {
    connection: redisConnection,
    concurrency: 2 // Jalankan 2 job secara paralel per worker node
  }
);

// Listener Event status pekerjaan di Queue
aiWorker.on('active', (job) => {
  const { email_id, tenant_id } = job.data || {};
  console.log(`[Queue: Active] Memproses Email ID ${email_id} (Tenant: ${tenant_id || 'Global'})...`);
});

aiWorker.on('completed', (job) => {
  const { email_id } = job.data || {};
  console.log(`[Queue: Completed] Email ID ${email_id} selesai diproses.`);
});

aiWorker.on('failed', (job, err) => {
  const email_id = job?.data?.email_id;
  console.log(`[Queue: Failed] Email ID ${email_id || 'unknown'} gagal diproses.`);
});

aiWorker.on('error', (err) => {
  if ((err as any).code !== 'ECONNREFUSED') {
    console.warn('[Worker Engine Warning]', err.message);
  }
});

/**
 * Real-time CLI Queue Monitor
 * Menampilkan statistik antrean Redis setiap 15 detik pada console log terminal server.
 */
setInterval(async () => {
  try {
    const counts = await emailQueue.getJobCounts();
    const pending = (counts.waiting || 0) + (counts.delayed || 0);
    const active = counts.active || 0;
    const completed = counts.completed || 0;
    const failed = counts.failed || 0;

    console.log(`[Redis Queue Monitor] 🔄 Pending: ${pending} | ⚡ Active: ${active} | ✅ Completed: ${completed} | ❌ Failed: ${failed}`);
  } catch (err) {
    // Abaikan jika Redis belum siap
  }
}, 15000);

