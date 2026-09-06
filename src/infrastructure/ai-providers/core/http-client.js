import { HTTP_CONCURRENCY, HTTP_MAX_RETRIES } from '../../../config/constants.js';

/**
 * Shared throttled HTTP client: concurrency limit, request queue,
 * exponential backoff with jitter on 429/5xx.
 */
export class ThrottledClient {
  constructor({ concurrency = HTTP_CONCURRENCY, maxRetries = HTTP_MAX_RETRIES } = {}) {
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this.active = 0;
    this.queue = [];
  }

  async request(url, options) {
    return this.#enqueue(() => this.#withRetries(url, options));
  }

  #enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.#drain();
    });
  }

  #drain() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      this.active++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          this.active--;
          this.#drain();
        });
    }
  }

  async #withRetries(url, options) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429 || res.status >= 500) {
          throw new HttpError(res.status, await res.text().catch(() => ''));
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
        }
        return await res.json();
      } catch (err) {
        lastError = err;
        const retryable = err instanceof HttpError || err.name === 'TypeError';
        if (!retryable || attempt === this.maxRetries) throw err;
        const backoff = Math.min(2 ** attempt * 500, 15000) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastError;
  }
}

class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${String(body).slice(0, 300)}`);
    this.status = status;
  }
}