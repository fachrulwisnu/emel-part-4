/**
 * =========================================================================
 * RABBITMQ & POSTGRESQL SYSTEM LOGS MODULE
 * =========================================================================
 *
 * [MIGRATION & ARCHITECTURE NOTE]:
 * - Queue Management: Menggunakan RabbitMQ via protokol AMQP (`amqplib`).
 * - System Logging: Tersentralisasi langsung pada PostgreSQL melalui tabel `system_logs` per tenant.
 * - Multi-Environment Support: Konfigurasi dinamis berbasis environment variables (.env) dengan fallback Local Dev.
 * - Automatic Network Recovery: Memiliki mekanisme auto-recovery & reconnect bawaan dengan interval 5000ms.
 */

import amqp from 'amqplib';
import { dbQuery } from '../services/dbManager';

/**
 * Membangun URL koneksi AMQP secara dinamis dari environment variables.
 *
 * Format URL AMQP:
 * `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}:${RABBITMQ_PORT}${RABBITMQ_VHOST}`
 *
 * Fallback Defaults (Local Development):
 * - User: 'guest'
 * - Pass: 'guest'
 * - Host: 'localhost'
 * - Port: '5672'
 * - VHost: '' (default root vhost)
 *
 * @returns {string} Connection string AMQP lengkap.
 */
export function getRabbitUrl(): string {
  if (process.env.RABBITMQ_URL) {
    return process.env.RABBITMQ_URL;
  }

  const user = encodeURIComponent(process.env.RABBITMQ_USER || 'guest');
  const pass = encodeURIComponent(process.env.RABBITMQ_PASS || 'guest');
  const host = process.env.RABBITMQ_HOST || 'localhost';
  const port = process.env.RABBITMQ_PORT || '5672';
  const rawVhost = process.env.RABBITMQ_VHOST || '';

  // Format vhost agar diawali dengan slash '/' jika diberikan dan belum diawali slash
  let vhost = '';
  if (rawVhost) {
    vhost = rawVhost.startsWith('/') ? rawVhost : `/${rawVhost}`;
  }

  return `amqp://${user}:${pass}@${host}:${port}${vhost}`;
}

export const RABBITMQ_URL = getRabbitUrl();
export const QUEUE_NAME = 'email_tasks_queue';

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let isConnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;

// Interval waktu reconnect otomatis (5000ms / 5 detik) sesuai standar NetworkRecoveryInterval: 5
const RECONNECT_INTERVAL_MS = 5000;

/**
 * Membuka koneksi AMQP ke broker RabbitMQ dan menginisialisasi Channel.
 * Dilengkapi dengan logika Automatic Recovery & Reconnect jika koneksi terputus.
 *
 * [AUTO-RECOVERY NOTE]: Jika terjadi error atau koneksi ditutup secara tidak sengaja,
 * sistem secara otomatis menjadwalkan koneksi ulang setiap 5000ms.
 *
 * @returns {Promise<amqp.Channel | null>} Mengembalikan Channel AMQP aktif jika terhubung, atau null jika RabbitMQ offline.
 */
export async function connectRabbitMQ(): Promise<amqp.Channel | null> {
  if (channel) return channel;
  if (isConnecting) return null;

  isConnecting = true;
  const rabbitUrl = getRabbitUrl();

  try {
    const maskedUrl = rabbitUrl.replace(/:[^:@]+@/, ':***@');
    console.log(`[RabbitMQ] Connecting to broker at ${maskedUrl}...`);

    // Inisialisasi koneksi AMQP ke broker RabbitMQ
    connection = await amqp.connect(rabbitUrl);

    // [INLINE COMMENT]: Event Listener 'error' pada koneksi AMQP untuk memicu Reconnect Otomatis
    connection.on('error', (err) => {
      console.warn(`[RabbitMQ Connection Error]: ${err.message || String(err)}. Initiating auto-recovery in ${RECONNECT_INTERVAL_MS / 1000}s...`);
      connection = null;
      channel = null;
      scheduleReconnect();
    });

    // [INLINE COMMENT]: Event Listener 'close' pada koneksi AMQP saat terputus dari broker
    connection.on('close', () => {
      console.log(`[RabbitMQ Connection Closed]. Initiating auto-recovery in ${RECONNECT_INTERVAL_MS / 1000}s...`);
      connection = null;
      channel = null;
      scheduleReconnect();
    });

    // Membuat channel komunikasi AMQP dan memastikan Queue bersifat durable
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    console.log(`[RabbitMQ] Connected successfully & asserted durable queue "${QUEUE_NAME}".`);

    // Batalkan timer reconnect jika koneksi telah berhasil pulih
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    return channel;
  } catch (err: any) {
    console.warn(`[RabbitMQ Connect Failed]: ${err.message || String(err)}. Retrying auto-recovery in ${RECONNECT_INTERVAL_MS / 1000}s...`);
    connection = null;
    channel = null;
    scheduleReconnect();
    return null;
  } finally {
    isConnecting = false;
  }
}

/**
 * Menjadwalkan percobaan Reconnect otomatis (Network Recovery) menggunakan setTimeout 5000ms.
 *
 * [INLINE COMMENT]: Mekanisme reconnect manual berbasis event loop interval 5 detik.
 */
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    console.log('[RabbitMQ Auto-Recovery] Attempting connection recovery to broker...');
    await connectRabbitMQ();
  }, RECONNECT_INTERVAL_MS);
}

/**
 * Mengambil channel RabbitMQ aktif atau menginisialisasi koneksi jika terputus/belum aktif.
 *
 * @returns {Promise<amqp.Channel | null>} Mengembalikan Channel AMQP aktif atau null jika RabbitMQ offline.
 */
export async function getRabbitChannel(): Promise<amqp.Channel | null> {
  if (channel) return channel;
  return await connectRabbitMQ();
}

/**
 * Mencatat entri log sistem per tenant ke dalam tabel PostgreSQL `system_logs`.
 *
 * [MIGRATION NOTE]: Logika ini sebelumnya menyimpan log aktivitas di Redis Hash/List.
 * Sekarang tersentralisasi di PostgreSQL untuk auditabilitas multi-tenant yang lebih terstruktur.
 *
 * @param {number | string} tenantId - ID Tenant pemilik log.
 * @param {string} message - Pesan/deskripsi aktivitas log.
 * @param {'INFO' | 'SUCCESS' | 'ERROR' | 'PROCESSING' | 'FAILED'} [status='INFO'] - Status eksekusi tugas.
 * @param {number} [progress=0] - Persentase progres tugas (0 - 100).
 * @param {string} [jobType='System'] - Jenis tugas/job yang dicatat.
 * @param {any} [metadata={}] - Metadata tambahan dalam bentuk objek JSON.
 * @returns {Promise<void>}
 */
export async function pushTenantLog(
  tenantId: number | string,
  message: string,
  status: 'INFO' | 'SUCCESS' | 'ERROR' | 'PROCESSING' | 'FAILED' = 'INFO',
  progress: number = 0,
  jobType: string = 'System',
  metadata: any = {}
): Promise<void> {
  const numericTenantId = Number(tenantId) || 1;
  const safeStatus = status.toUpperCase();
  const metaObj = { progress, jobType, ...metadata };

  try {
    // [POSTGRESQL QUERY]: Memasukkan entri log ke tabel system_logs berskala multi-tenant
    await dbQuery(
      `INSERT INTO system_logs (tenant_id, task_type, status, message, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [numericTenantId, jobType, safeStatus, message, JSON.stringify(metaObj)]
    );
  } catch (err: any) {
    // Fallback logging ke console jika koneksi database mengalami gangguan
    console.warn(`[pushTenantLog DB Fallback - Tenant ${numericTenantId}]`, message);
  }
}

/**
 * Mempublikasikan (Publisher) payload tugas baru ke RabbitMQ queue dan mencatat statusnya di PostgreSQL.
 * Operasi ini bersifat asinkron (non-blocking task queueing).
 *
 * [MIGRATION NOTE]: Logika ini sebelumnya menggunakan `emailQueue.add()` pada BullMQ/Redis.
 * Sekarang menggunakan RabbitMQ AMQP `channel.sendToQueue()` dengan flag `persistent: true`
 * untuk daya tahan pesan (message durability) serta penanganan fallback background langsung jika broker RabbitMQ offline.
 *
 * @param {number} tenantId - ID Tenant terkait.
 * @param {'SYNC_MAIL' | 'AI_PARSE' | 'BULK_SUMMARY' | string} taskType - Jenis tugas yang dieksekusi.
 * @param {any} payload - Data/payload tugas yang akan dikirim ke antrean.
 * @returns {Promise<{ success: boolean; message: string; queued: boolean }>} Status hasil publikasi tugas ke antrean.
 */
export async function publishTask(
  tenantId: number,
  taskType: 'SYNC_MAIL' | 'AI_PARSE' | 'BULK_SUMMARY' | string,
  payload: any
): Promise<{ success: boolean; message: string; queued: boolean }> {
  const numericTenantId = Number(tenantId) || 1;
  const messageData = {
    tenantId: numericTenantId,
    taskType,
    payload,
    timestamp: new Date().toISOString()
  };

  // 1. [POSTGRESQL LOG]: Catat status 'PROCESSING' di tabel system_logs
  await pushTenantLog(
    numericTenantId,
    `Task "${taskType}" published to RabbitMQ queue.`,
    'PROCESSING',
    0,
    taskType
  );

  // 2. [RABBITMQ PUBLISHER]: Mengirimkan payload JSON sebagai Buffer ke queue RabbitMQ
  const ch = await getRabbitChannel();
  if (ch) {
    try {
      const buffer = Buffer.from(JSON.stringify(messageData));
      // Inisialisasi pengiriman pesan AMQP dengan opsi persistent: true agar bertahan dari broker restart
      ch.sendToQueue(QUEUE_NAME, buffer, { persistent: true });
      return {
        success: true,
        message: "Task successfully queued to RabbitMQ",
        queued: true
      };
    } catch (err: any) {
      console.error('[RabbitMQ Publish Error]', err.message);
    }
  }

  // 3. Fallback: Jika broker RabbitMQ sedang offline, eksekusi secara langsung di background worker fallback
  console.warn(`[RabbitMQ Offline] Direct execution fallback for task "${taskType}" (Tenant #${numericTenantId})...`);
  setTimeout(() => {
    executeTaskDirectly(numericTenantId, taskType, payload).catch((e) => {
      console.error(`[Direct Task Fallback Error]`, e);
    });
  }, 100);

  return {
    success: true,
    message: "Task queued (Direct background processing fallback active)",
    queued: true
  };
}

/**
 * Handler penanganan tugas langsung di background ketika broker RabbitMQ offline.
 *
 * @param {number} tenantId - ID Tenant.
 * @param {string} taskType - Tipe tugas.
 * @param {any} payload - Payload tugas.
 * @returns {Promise<void>}
 */
async function executeTaskDirectly(tenantId: number, taskType: string, payload: any) {
  try {
    if (taskType === 'SYNC_MAIL' || taskType === 'SyncPOP3' || taskType === 'sync-pop3') {
      const { performBackgroundSync } = await import('../cron');
      await performBackgroundSync();
      await pushTenantLog(tenantId, `[SyncPOP3] POP3 email sync completed.`, 'SUCCESS', 100, 'SYNC_MAIL');
    } else if (taskType === 'BULK_SUMMARY' || taskType === 'DailyBulkSummary' || taskType === 'bulk-summary') {
      const targetDate = payload.targetDate || payload.target_date || new Date().toISOString().split('T')[0];
      const { generateDailySummary } = await import('../services/aiProcessingService');
      await generateDailySummary(tenantId, targetDate);
      await pushTenantLog(tenantId, `[DailyBulkSummary] AI Daily Summary generated for ${targetDate}.`, 'SUCCESS', 100, 'BULK_SUMMARY');
    } else {
      const messageId = String(payload.message_id || payload.messageId || payload.email_id || payload.id || '').trim();
      if (messageId) {
        const { analyzeEmail } = await import('../database-service');
        const emailBody = payload.body || payload.body_text || payload.html_body || '';
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
        await analyzeEmail(emailToProcess, tenantId);
        await pushTenantLog(tenantId, `[IndividualEmailParsing] AI extraction completed for Email ${messageId}.`, 'SUCCESS', 100, 'AI_PARSE');
      }
    }
  } catch (err: any) {
    await pushTenantLog(tenantId, `[Task Error: ${taskType}] ${err.message || String(err)}`, 'FAILED', 100, taskType);
  }
}

/**
 * Mengambil daftar log sistem dari tabel PostgreSQL `system_logs` untuk tenant tertentu.
 *
 * [MIGRATION NOTE]: Sebelumnya query dilakukan pada koleksi MongoDB / Redis logs.
 * Sekarang menggunakan SQL SELECT pada PostgreSQL berindeks tenant_id & created_at.
 *
 * @param {number} tenantId - ID Tenant.
 * @param {number} [limit=100] - Batas jumlah log yang diambil.
 * @returns {Promise<any[]>} Objek array daftar log eksekusi.
 */
export async function getSystemLogsForTenant(tenantId: number, limit: number = 100) {
  try {
    // [POSTGRESQL QUERY]: Mengambil urutan log sistem berdasarkan waktu pembuatan terbaru (DESC)
    const res = await dbQuery(
      `SELECT * FROM system_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [Number(tenantId), limit]
    );
    return res.rows || [];
  } catch (err: any) {
    console.error('[getSystemLogsForTenant Error]', err);
    return [];
  }
}

/**
 * Mengambil daftar ID Tenant unik yang memiliki riwayat pencatatan log pada sistem.
 *
 * [MIGRATION NOTE]: Digantikan dari Mongoose `distinct()` ke SQL `SELECT DISTINCT tenant_id`.
 *
 * @returns {Promise<number[]>} Array berisi daftar ID tenant aktif.
 */
export async function getActiveLogTenants() {
  try {
    // [POSTGRESQL QUERY]: Mengambil daftar ID tenant unik dari system_logs
    const res = await dbQuery(
      `SELECT DISTINCT tenant_id FROM system_logs ORDER BY tenant_id ASC`
    );
    return (res.rows || []).map((r: any) => r.tenant_id);
  } catch (err: any) {
    return [1];
  }
}


