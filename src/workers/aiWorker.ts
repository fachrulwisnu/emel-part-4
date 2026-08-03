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

    // Step A: Verifikasi data email di database berdasarkan message_id
    const email = await dbGetEmailByMessageId(email_id);
    if (tenant_id) {
      await dbGetTenantById(Number(tenant_id)).catch(() => null);
    }

    if (!email) {
      console.warn(`[Worker Warning] Email with ID ${email_id} not found in database.`);
      return { success: false, reason: 'Email not found' };
    }

    // Step B: Eksekusi LLM Analysis & update status ke 'COMPLETED' / 'FAILED'
    try {
      await analyzeEmail(email_id);
      return { success: true, email_id };
    } catch (err: any) {
      console.error(`[Worker Exception] Error processing Email ID ${email_id}:`, err.message || err);
      // Tandai status 'FAILED' di database jika gagal
      await dbUpdateEmailFields(email_id, { ai_status: 'FAILED' }).catch(() => {});
      throw err; // Trigger BullMQ auto-retry dengan exponential backoff
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

