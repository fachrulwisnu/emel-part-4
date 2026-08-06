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
import { redisConnection, QUEUE_NAME, emailQueue, pushTenantLog } from '../config/queue';
import { dbGetEmailByMessageId, analyzeEmail, dbUpdateEmailFields } from '../database-service';
import { dbGetTenantById } from '../services/dbManager';

console.log('[Worker Service] Initializing Email & AI Processing Worker...');

/**
 * BullMQ Worker instance handling asynchronous email processing, POP3 sync, and Daily Bulk Summaries
 */
export const aiWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const jobName = job.name || 'IndividualEmailParsing';
    const payload = job.data || {};
    const tenantId = Number(payload.tenant_id || payload.tenantId || 1);

    console.log(`[Queue Worker] Processing Job "${jobName}" (#${job.id}) for Tenant #${tenantId}...`);

    // --- JOB TYPE 1: SyncPOP3 ---
    if (jobName === 'SyncPOP3' || jobName === 'sync-pop3') {
      await pushTenantLog(tenantId, `[SyncPOP3] Starting POP3 background email sync for Tenant #${tenantId}...`, 'INFO', 10, 'SyncPOP3');
      try {
        const { performBackgroundSync } = await import('../cron');
        await pushTenantLog(tenantId, `[SyncPOP3] Executing POP3 connection and message retrieval...`, 'INFO', 50, 'SyncPOP3');
        const syncRes = await performBackgroundSync();
        await pushTenantLog(tenantId, `[SyncPOP3] POP3 email sync completed successfully. New emails stored.`, 'SUCCESS', 100, 'SyncPOP3');
        return syncRes;
      } catch (err: any) {
        await pushTenantLog(tenantId, `[SyncPOP3] Error during POP3 sync: ${err.message || String(err)}`, 'ERROR', 100, 'SyncPOP3');
        throw err;
      }
    }

    // --- JOB TYPE 2: DailyBulkSummary ---
    if (jobName === 'DailyBulkSummary' || jobName === 'bulk-summary') {
      const targetDate = payload.targetDate || payload.target_date || new Date().toISOString().split('T')[0];
      await pushTenantLog(tenantId, `[DailyBulkSummary] Initiating Daily AI Summary generation for date ${targetDate} (Tenant #${tenantId})...`, 'INFO', 15, 'DailyBulkSummary');
      try {
        const { generateDailySummary } = await import('../services/aiProcessingService');
        await pushTenantLog(tenantId, `[DailyBulkSummary] Processing and aggregating email tickets for date ${targetDate}...`, 'INFO', 60, 'DailyBulkSummary');
        const summaryResult = await generateDailySummary(tenantId, targetDate);
        await pushTenantLog(tenantId, `[DailyBulkSummary] AI Daily Summary successfully generated for ${targetDate}.`, 'SUCCESS', 100, 'DailyBulkSummary');
        return summaryResult;
      } catch (err: any) {
        await pushTenantLog(tenantId, `[DailyBulkSummary] Failed generating daily summary for ${targetDate}: ${err.message || String(err)}`, 'ERROR', 100, 'DailyBulkSummary');
        throw err;
      }
    }

    // --- JOB TYPE 3: IndividualEmailParsing ---
    const messageId = String(payload.message_id || payload.messageId || payload.email_id || payload.id || '').trim();

    if (!messageId) {
      console.warn(`[Queue: Ignored] Membuang job tanpa message_id.`);
      await pushTenantLog(tenantId, `[IndividualEmailParsing] Ignored job: missing message_id`, 'INFO', 100, 'IndividualEmailParsing');
      return { success: false, reason: 'missing_message_id' };
    }

    const emailBody = payload.body || payload.body_text || payload.html_body;
    if (!emailBody || String(emailBody).trim().length === 0) {
      console.warn(`[Queue: Ignored] Payload tidak lengkap untuk ID ${messageId}.`);
      await pushTenantLog(tenantId, `[IndividualEmailParsing] Skipped Email ${messageId}: incomplete email body payload.`, 'INFO', 100, 'IndividualEmailParsing');
      return { success: false, reason: 'incomplete_payload' };
    }

    await pushTenantLog(tenantId, `[IndividualEmailParsing] Starting AI extraction for Email ${messageId}...`, 'INFO', 25, 'IndividualEmailParsing');

    const emailToProcess = {
      message_id: messageId,
      tenant_id: tenantId,
      subject: payload.subject || '',
      sender: payload.sender || payload.sender_email || '',
      date: payload.received_at || payload.date || new Date().toISOString(),
      body_text: emailBody,
      body: emailBody,
      attachments: payload.attachments || []
    };

    try {
      await analyzeEmail(emailToProcess, tenantId);
      console.log(`[Queue: Completed] Email ID ${messageId} selesai diproses.`);
      await pushTenantLog(tenantId, `[IndividualEmailParsing] AI extraction completed for Email ${messageId}.`, 'SUCCESS', 100, 'IndividualEmailParsing');
      return { success: true, messageId };
    } catch (err: any) {
      console.error(`[Worker Exception] Error processing Email message_id ${messageId}:`, err.message || err);
      await pushTenantLog(tenantId, `[IndividualEmailParsing] Error processing Email ${messageId}: ${err.message || String(err)}`, 'ERROR', 100, 'IndividualEmailParsing');
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

