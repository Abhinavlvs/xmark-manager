/**
 * Request/response client over `runtime.sendMessage`. The browser API is injected.
 */

export class RequestError extends Error {
  /** @param {string} code stable error code from the background, or `unavailable`/`bad_response` */
  constructor(code) {
    super(code);
    this.name = 'RequestError';
    this.code = code;
  }
}

/**
 * @param {{runtime: {sendMessage(m: object): Promise<unknown>}, isIncognito: boolean}} deps
 */
export function createRuntimeClient({ runtime, isIncognito }) {
  return {
    /**
     * @param {string} type
     * @param {unknown} [payload]
     * @returns {Promise<any>} the unwrapped `data`
     */
    async request(type, payload) {
      let res;
      try {
        res = await runtime.sendMessage({ type, payload, incognito: isIncognito });
      } catch {
        throw new RequestError('unavailable');
      }
      if (typeof res !== 'object' || res === null || typeof res.ok !== 'boolean') {
        throw new RequestError('bad_response');
      }
      if (res.ok) return res.data;
      throw new RequestError(typeof res.error === 'string' ? res.error : 'bad_response');
    },
  };
}
