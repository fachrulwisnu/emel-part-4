/**
 * =========================================================================
 * RABBITMQ & POSTGRESQL SYSTEM LOGS MODULE
 * =========================================================================
 *
 * [MIGRATION NOTE]: Modul ini menggantikan arsitektur Redis & BullMQ secara penuh.
 * - Queue Management: Menggunakan RabbitMQ via protokol AMQP (`amqplib`).
 * - System Logging: Tersentralisasi langsung pada PostgreSQL melalui tabel `system_logs` per tenant.
 */

import amqp from 'amqplib';
import { dbQuery } from '../services/dbManager';

export const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
export const QUEUE_NAME = 'email_tasks_queue';

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let isConnecting = false;

/**
 * Menginisialisasi serta memastikan koneksi AMQP dan Channel RabbitMQ siap digunakan.
 * 
 * [MIGRATION NOTE]: Sebelumnya menggunakan koneksi Redis ioredis / BullMQ Queue instance.
 * Sekarang menggunakan koneksi persistent AMQP Channel tunggal dengan penanganan auto-reconnect.
 *
 * @returns {Promise<amqp.Channel | null>} Mengembalikan Channel AMQP aktif jika terhubung, atau null jika RabbitMQ offline.
 */
export async function getRabbitChannel(): Promise<amqp.Channel | null> {
  if (channel) return channel;
  if (isConnecting) return null;

  isConnecting = true;
  try {
    // Inisialisasi koneksi AMQP ke broker RabbitMQ
    connection = await amqp.connect(RABBITMQ_URL);
    
    // Handler error koneksi AMQP untuk mencegah proses crash jika broker terputus
    connection.on('error', (err) => {
      console.warn('[RabbitMQ Connection Error]', err.message);
      connection = null;
      channel = null;
    });

    // Handler penutupan koneksi AMQP
    connection.on('close', () => {
      console.log('[RabbitMQ Connection Closed]');
      connection = null;
      channel = null;
    });

    // Membuat channel komunikasi AMQP tunggal dan memastikan Queue bersifat durable
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log(`[RabbitMQ] Connected and asserted queue "${QUEUE_NAME}" successfully.`);
    return channel;
  } catch (err: any) {
    if (err.code !== 'ECONNREFUSED') {
      console.warn('[RabbitMQ Init Warning]', err.message || err);
    }
    channel = null;
    connection = null;
    return null;
  } finally {
    isConnecting = false;
  }
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

