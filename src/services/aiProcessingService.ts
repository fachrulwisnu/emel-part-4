/**
 * AI Processing Service
 * Provides configuration and helper utilities for batching, throttling, and exponential backoff
 * to prevent hitting the NVIDIA 40 RPM limit and avoiding timeouts.
 */

export const AI_CONFIG = {
  batchSize: 5,               // Maksimal 5-8 email per batch
  throttleDelay: 15000,       // Jeda waktu antar batch (15-20 detik)
  retryDelaySeconds: 30       // Detik tunggu jika kena limit 429
};

/**
 * Executes a function with exponential backoff on HTTP 429 (Too Many Requests).
 */
export async function executeWithBackoff<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const is429 = error?.status === 429 || 
                  error?.statusCode === 429 || 
                  error?.response?.status === 429;

    if (is429 && retries > 0) {
      const retryAfter = AI_CONFIG.retryDelaySeconds;
      console.warn(`[AI Warning] Limit NVIDIA tercapai (429). Menunggu ${retryAfter} detik...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return executeWithBackoff(fn, retries - 1);
    }
    throw error;
  }
}
