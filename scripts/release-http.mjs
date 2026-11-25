/**
 * Small fetch helper for the store upload scripts: every request gets a timeout; idempotent GETs
 * are retried a few times on network errors, HTTP 429 and 5xx. Anything else (uploads, creates,
 * publishes) is sent exactly once and never retried.
 */

const RETRYABLE = (status) => status === 429 || status >= 500;

/**
 * @param {typeof fetch} doFetch
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{timeoutMs?: number, retries?: number, sleep?: (ms: number) => Promise<void>}} [options]
 */
export async function request(doFetch, url, init = {}, options = {}) {
  const {
    timeoutMs = 30_000,
    retries = 2,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = options;
  const method = (init.method ?? 'GET').toUpperCase();
  const attempts = method === 'GET' ? retries + 1 : 1;
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!(method === 'GET' && RETRYABLE(response.status)) || i === attempts - 1) return response;
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) throw error;
    }
    await sleep(1000 * 2 ** i);
  }
  throw lastError;
}
