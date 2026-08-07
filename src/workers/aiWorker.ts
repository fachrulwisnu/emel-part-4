/**
 * =========================================================================
 * RABBITMQ WORKER SERVICE: ASYNCHRONOUS TASK CONSUMER
 * =========================================================================
 *
 * [MIGRATION NOTE]: Worker ini sebelumnya berbasis BullMQ dengan backend Redis.
 * Sekarang telah dimigrasi ke RabbitMQ AMQP Consumer murni untuk menghindari
 * locking issue, mematuhi SOP Enterprise, serta terintegrasi langsung dengan 
 * PostgreSQL `system_logs` untuk pelaporan per tenant.
 *
 * FLOW AMQP CONSUMER:
 * 1. Worker mendengarkan antrean RabbitMQ (`email_tasks_queue`).
 * 2. Mengambil message payload { tenantId, taskType, payload }.
 * 3. Memproses tugas secara asinkron di background (SYNC_MAIL, AI_PARSE, BULK_SUMMARY).
 * 4. Mencatat setiap progres/status ke tabel PostgreSQL `system_logs`.
 * 5. Mengirimkan `channel.ack(msg)` jika sukses, atau `channel.nack(msg, false, false)` jika gagal.
 */

import { getRabbitChannel, QUEUE_NAME, pushTenantLog } from '../config/rabbitmq';
import { dbGetEmailByMessageId, analyzeEmail, dbUpdateEmailFields } from '../database-service';

console.log('[RabbitMQ Worker Service] Initializing Background Task Worker...');

/**
 * Menjalankan dan memelihara RabbitMQ AMQP Consumer untuk memproses antrean tugas di background.
 *
 * [MIGRATION NOTE]: Logika ini menggantikan BullMQ `Worker` instance dari Redis.
 * Menggunakan `channel.consume()` dari `amqplib` dengan penanganan kontrol konkurensi via `channel.prefetch()`.
 *
 * @returns {Promise<void>}
 */
export async function startRabbitWorker() {
  // Inisialisasi AMQP Channel komunikasi RabbitMQ
  const channel = await getRabbitChannel();
  if (!channel) {
    console.warn('[RabbitMQ Worker] RabbitMQ broker unavailable or connecting... Worker will retry connection.');
    setTimeout(startRabbitWorker, 5000);
    return;
  }

  console.log(`[RabbitMQ Worker] Listening on queue "${QUEUE_NAME}"...`);
  
  // Set limit prefetch AMQP: Memproses maksimal 5 tugas secara paralel per worker node (throttling untuk PostgreSQL)
  await channel.prefetch(5);

  const safeAck = (m: any) => {
    try {
      channel.ack(m);
    } catch (e) {
      console.warn('[RabbitMQ Worker] Error sending ACK:', e);
    }
  };

  const safeNack = (m: any) => {
    try {
      channel.nack(m, false, false);
    } catch (e) {
      console.warn('[RabbitMQ Worker] Error sending NACK:', e);
    }
  };

  // [RABBITMQ CONSUMER]: Mulai mendengarkan pesan masuk dari queue RabbitMQ
  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    let taskData: any = {};
    try {
      // Parsing payload JSON dari buffer AMQP
      taskData = JSON.parse(msg.content.toString());
    } catch (parseErr) {
      console.error('[RabbitMQ Worker Error] Invalid JSON payload in queue message');
      // [RABBITMQ NACK]: Menolak pesan cacat (malformed JSON) tanpa melakukan requeue agar tidak memicu dead-loop
      safeNack(msg);
      return;
    }

    const tenantId = Number(taskData.tenantId || taskData.tenant_id || 1);
    const taskType = String(taskData.taskType || taskData.jobName || 'AI_PARSE');
    const payload = taskData.payload || taskData;

    console.log(`[RabbitMQ Consumer] Received task "${taskType}" for Tenant #${tenantId}...`);

    try {
      // --- TASK TYPE 1: SYNC_MAIL (Sinkronisasi POP3 Email) ---
      if (taskType === 'SYNC_MAIL' || taskType === 'SyncPOP3' || taskType === 'sync-pop3') {
        // [POSTGRESQL LOG]: Catat status eksekusi diawali
        await pushTenantLog(tenantId, `[SyncPOP3] Starting POP3 background email sync for Tenant #${tenantId}...`, 'PROCESSING', 10, 'SYNC_MAIL');
        const { performBackgroundSync } = await import('../cron');
        await performBackgroundSync();
        // [POSTGRESQL LOG]: Catat status eksekusi berhasil
        await pushTenantLog(tenantId, `[SyncPOP3] POP3 email sync completed successfully for Tenant #${tenantId}.`, 'SUCCESS', 100, 'SYNC_MAIL');
        
        // [RABBITMQ ACK]: Konfirmasi pesan telah sukses diproses dan dihapus dari queue RabbitMQ
        safeAck(msg);
        return;
      }

      // --- TASK TYPE 2: BULK_SUMMARY (Ringkasan AI Harian) ---
      if (taskType === 'BULK_SUMMARY' || taskType === 'DailyBulkSummary' || taskType === 'bulk-summary') {
        const targetDate = payload.targetDate || payload.target_date || new Date().toISOString().split('T')[0];
        // [POSTGRESQL LOG]: Catat status pembuatan ringkasan harian
        await pushTenantLog(tenantId, `[DailyBulkSummary] Initiating Daily AI Summary for date ${targetDate} (Tenant #${tenantId})...`, 'PROCESSING', 15, 'BULK_SUMMARY');
        const { generateDailySummary } = await import('../services/aiProcessingService');
        await generateDailySummary(tenantId, targetDate);
        // [POSTGRESQL LOG]: Catat keberhasilan pembuatan ringkasan harian
        await pushTenantLog(tenantId, `[DailyBulkSummary] AI Daily Summary successfully generated for ${targetDate}.`, 'SUCCESS', 100, 'BULK_SUMMARY');
        
        // [RABBITMQ ACK]: Konfirmasi pesan sukses diproses
        safeAck(msg);
        return;
      }

      // --- TASK TYPE 3: AI_PARSE (Ekstraksi & Analisis AI Email Individual) ---
      const messageId = String(payload.message_id || payload.messageId || payload.email_id || payload.id || '').trim();

      if (!messageId) {
        console.warn(`[RabbitMQ Worker] Ignored task missing message_id.`);
        await pushTenantLog(tenantId, `[AI_PARSE] Skipped task: missing message_id`, 'INFO', 100, 'AI_PARSE');
        // [RABBITMQ ACK]: Hapus pesan yang tidak valid dari queue (DO NOT REQUEUE)
        safeAck(msg);
        return;
      }

      let emailBody = payload.body || payload.body_text || payload.html_body;

      // Fallback: Jika body di payload kosong, coba query langsung dari database PostgreSQL
      if (!emailBody || String(emailBody).trim().length === 0) {
        try {
          const dbEmail = await dbGetEmailByMessageId(messageId, tenantId);
          if (dbEmail) {
            emailBody = dbEmail.body_text || dbEmail.html_body || dbEmail.body || '';
            if (!payload.subject) payload.subject = dbEmail.subject || '';
            if (!payload.sender) payload.sender = dbEmail.sender || '';
            if (!payload.received_at) payload.received_at = dbEmail.date || new Date().toISOString();
            if (!payload.attachments) payload.attachments = dbEmail.attachments || [];
          }
        } catch (dbFetchErr) {
          console.warn(`[RabbitMQ Worker] Error fetching email ${messageId} from DB:`, dbFetchErr);
        }
      }

      if (!emailBody || String(emailBody).trim().length === 0) {
        console.warn(`[RabbitMQ Worker] Skipped ID ${messageId}: incomplete email body payload.`);
        await pushTenantLog(tenantId, `[AI_PARSE] Skipped Email ${messageId}: incomplete email body payload.`, 'INFO', 100, 'AI_PARSE');
        // Tandai status di DB agar tidak terus-menerus diambil oleh query pending
        await dbUpdateEmailFields(messageId, { ai_status: 'SKIPPED_NO_BODY' }).catch(() => {});
        // [RABBITMQ ACK]: Wajib ACK/NACK (buang pesan dari antrean, JANGAN di-requeue agar tidak loop)
        safeAck(msg);
        return;
      }

      // [POSTGRESQL LOG]: Catat dimulainya analisis AI untuk email
      await pushTenantLog(tenantId, `[AI_PARSE] Starting AI extraction for Email ${messageId}...`, 'PROCESSING', 25, 'AI_PARSE');

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

      // Eksekusi ekstraksi LLM/Gemini & simpan ke PostgreSQL
      await analyzeEmail(emailToProcess, tenantId);
      console.log(`[RabbitMQ Worker] Email ID ${messageId} processed successfully.`);
      
      // [POSTGRESQL LOG]: Catat keberhasilan ekstraksi AI
      await pushTenantLog(tenantId, `[AI_PARSE] AI extraction completed for Email ${messageId}.`, 'SUCCESS', 100, 'AI_PARSE');
      
      // [RABBITMQ ACK]: Mengirim pengakuan sukses (acknowledgement) ke broker RabbitMQ
      safeAck(msg);

    } catch (err: any) {
      console.error(`[RabbitMQ Worker Exception] Error processing task "${taskType}":`, err.message || err);
      // [POSTGRESQL LOG]: Catat kegagalan tugas ke sistem log per tenant
      await pushTenantLog(tenantId, `[${taskType} Error] ${err.message || String(err)}`, 'FAILED', 100, taskType);
      
      if (payload?.message_id) {
        // [POSTGRESQL UPDATE]: Update status email menjadi FAILED jika ekstraksi gagal
        await dbUpdateEmailFields(payload.message_id, { ai_status: 'FAILED' }).catch(() => {});
      }
      
      // [RABBITMQ NACK]: Menolak pesan yang gagal diproses (allUpToDate=false, requeue=false)
      // requeue set ke false untuk mencegah infinite retry loop saat terjadi unhandled error
      safeNack(msg);
    }
  });
}

// Jalankan RabbitMQ worker secara otomatis saat modul dimuat
startRabbitWorker();

