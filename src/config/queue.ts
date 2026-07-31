import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

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
  if (err.code !== 'ECONNREFUSED') {
    console.warn('[Redis Connection Warning]', err.message);
  }
});

export const QUEUE_NAME = 'email-ai-queue';

export const emailQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});
