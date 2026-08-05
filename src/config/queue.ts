/**
 * =========================================================================
 * REDIS & BULLMQ CONFIGURATION MODULE
 * =========================================================================
 * 
 * FLOW:
 * 1. Menghubungkan aplikasi ke Redis Server (Memurai di Windows / Redis di Linux).
 * 2. Menginisialisasi antrean BullMQ (`email-ai-queue`).
 * 3. Menyiapkan konfigurasi retry otomatis (3x percobaan dengan interval eksponensial 5 detik)
 *    apabila AI Provider / LLM mengalami rate limit (HTTP 429) atau timeout.
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

/**
 * Konfigurasi koneksi Redis dengan toleransi kegagalan koneksi
 */
export const redisConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    // Retry connecting gracefully every 2 seconds if Redis server is starting up or offline
    return Math.min(times * 500, 2000);
  }
};

export const redisConnection = new Redis(redisConnectionOptions);

redisConnection.on('error', (err) => {
  if ((err as any)?.code !== 'ECONNREFUSED') {
    console.warn('[Redis Connection Warning]', err.message);
  }
});

/**
 * Nama antrean utama untuk job pemrosesan AI email
 */
export const QUEUE_NAME = 'email-ai-queue';

/**
 * BullMQ Queue Instance
 * Mengelola pendaftaran pekerjaan (job) pemrosesan email asinkron.
 */
export const emailQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5, // Maksimal 5x percobaan ulang jika terjadi kegagalan/email belum tercommit
    backoff: {
      type: 'fixed',
      delay: 2000
    }
  }
});

emailQueue.on('error', (err) => {
  if ((err as any)?.code !== 'ECONNREFUSED') {
    console.warn('[Redis Queue Warning]', err.message);
  }
});

export const aiQueue = emailQueue;

// Script cleanup sementara untuk membersihkan antrean usang saat startup
async function clearStaleQueues() {
  try {
    await aiQueue.obliterate({ force: true });
    console.log("🧹 [Redis] Seluruh antrean AI lama berhasil dibersihkan!");
  } catch (error) {
    console.log("🧹 [Redis] Obliterate skipped atau queue sudah kosong.");
  }
}

clearStaleQueues();

