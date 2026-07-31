import { Worker, QueueEvents } from 'bullmq';
import { redisConnection, QUEUE_NAME, emailQueue } from '../config/queue';
import { dbGetEmailByMessageId, analyzeEmail, dbUpdateEmailFields } from '../database-service';
import { dbGetTenantById } from '../services/dbManager';

console.log('[Worker Service] Initializing Email AI Worker...');

export const aiWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { email_id, tenant_id } = job.data || {};
    if (!email_id) {
      throw new Error('Invalid job payload: missing email_id');
    }

    // b. Query database to verify email text & tenant AI config
    const email = await dbGetEmailByMessageId(email_id);
    if (tenant_id) {
      await dbGetTenantById(Number(tenant_id)).catch(() => null);
    }

    if (!email) {
      console.warn(`[Worker Warning] Email with ID ${email_id} not found in database.`);
      return { success: false, reason: 'Email not found' };
    }

    // c. & d. Send to AI model & update DB status to 'COMPLETED' or 'FAILED'
    try {
      await analyzeEmail(email_id);
      return { success: true, email_id };
    } catch (err: any) {
      console.error(`[Worker Exception] Error processing Email ID ${email_id}:`, err.message || err);
      await dbUpdateEmailFields(email_id, { ai_status: 'FAILED' }).catch(() => {});
      throw err; // Trigger BullMQ auto-retry with exponential backoff
    }
  },
  {
    connection: redisConnection,
    concurrency: 2
  }
);

// Worker Event Listeners as per Instruction 1
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

// 15-second interval CLI Queue Monitor
setInterval(async () => {
  try {
    const counts = await emailQueue.getJobCounts();
    const pending = (counts.waiting || 0) + (counts.delayed || 0);
    const active = counts.active || 0;
    const completed = counts.completed || 0;
    const failed = counts.failed || 0;

    console.log(`[Redis Queue Monitor] 🔄 Pending: ${pending} | ⚡ Active: ${active} | ✅ Completed: ${completed} | ❌ Failed: ${failed}`);
  } catch (err) {
    // Suppress warning if Redis is temporarily unreachable
  }
}, 15000);
