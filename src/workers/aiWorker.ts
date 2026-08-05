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
    const emailPayload = job.data || {};
    const messageId = String(emailPayload.message_id || emailPayload.messageId || emailPayload.email_id || emailPayload.id || '').trim();
    const tenantId = emailPayload.tenant_id || emailPayload.tenantId || 1;

    console.log(`[Queue: Active] Memproses Email ID ${messageId} (Tenant: ${tenantId})...`);

    if (!messageId) {
      console.warn(`[Queue: Ignored] Membuang stale job tanpa message_id.`);
      return { success: false, reason: 'missing_message_id' };
    }

    // INSTRUKSI 2: Validasi Payload Ketat (Tolak Antrean Usang)
    const emailBody = emailPayload.body || emailPayload.body_text || emailPayload.html_body;
    if (!emailBody || String(emailBody).trim().length === 0) {
      console.warn(`[Queue: Ignored] Membuang stale job untuk ID ${messageId} karena payload tidak lengkap (Bukan Full Payload).`);
      return { success: false, reason: 'incomplete_payload' };
    }

    const emailToProcess = {
      message_id: messageId,
      tenant_id: tenantId,
      subject: emailPayload.subject || '',
      sender: emailPayload.sender || emailPayload.sender_email || '',
      date: emailPayload.received_at || emailPayload.date || new Date().toISOString(),
      body_text: emailBody,
      body: emailBody,
      attachments: emailPayload.attachments || []
    };

    try {
      await analyzeEmail(emailToProcess, tenantId);
      console.log(`[Queue: Completed] Email ID ${messageId} selesai diproses.`);
      return { success: true, messageId };
    } catch (err: any) {
      console.error(`[Worker Exception] Error processing Email message_id ${messageId}:`, err.message || err);
      await dbUpdateEmailFields(messageId, { ai_status: 'FAILED' }).catch(() => {});
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2 // Jalankan 2 job secara paralel per worker node
  }
);

// Listener Event status pekerjaan di Queue
aiWorker.on('active', (job) => {
  const emailPayload = job.data || {};
  const messageId = emailPayload.message_id || emailPayload.messageId || emailPayload.email_id || emailPayload.id;
  console.log(`[Queue: Active] Memproses Email ID ${messageId} (Tenant: ${emailPayload.tenant_id || 'Global'})...`);
});

aiWorker.on('completed', (job) => {
  const emailPayload = job.data || {};
  const messageId = emailPayload.message_id || emailPayload.messageId || emailPayload.email_id || emailPayload.id;
  console.log(`[Queue: Completed] Email ID ${messageId} selesai diproses.`);
});

aiWorker.on('failed', (job, err) => {
  const emailPayload = job?.data || {};
  const messageId = emailPayload.message_id || emailPayload.messageId || emailPayload.email_id || emailPayload.id;
  console.log(`[Queue: Failed] Email ID ${messageId || 'unknown'} gagal diproses.`);
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

