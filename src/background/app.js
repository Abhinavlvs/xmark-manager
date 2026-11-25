/**
 * Builds the background object graph and the runtime message listener.
 * Pure of `browser.*` globals: the browser API is injected.
 */

import { createLocalStore } from '../platform/local-store.js';
import { createSettingsStore } from '../platform/settings-store.js';
import { createRepository } from '../core/repository.js';
import { systemClock } from '../core/clock.js';
import { createId } from '../core/ids.js';
import { createHandlers } from './handlers.js';
import { createMessageGuard } from './guard.js';
import { createSettingsOpener } from './open-settings.js';

/** Rate-limit key: one per tab (or per extension page without a tab). */
const senderKey = (sender) => String(sender?.tab?.id ?? sender?.frameId ?? sender?.url ?? '');

/**
 * @param {{
 *   browserApi: {storage: {local: import('../platform/local-store.js').StorageArea}, runtime: {id: string, getURL(path: string): string}, tabs?: {create(opts: {url: string}): Promise<unknown>}},
 * }} deps
 * @returns {(message: unknown, sender: object) => Promise<import('../platform/messages.js').Response>}
 */
export function buildApp({ browserApi }) {
  const area = browserApi.storage.local;
  const store = createLocalStore(area);
  const settings = createSettingsStore(area);
  const repo = createRepository({ store, clock: systemClock, createId });
  const openSettings = createSettingsOpener({
    tabs: browserApi.tabs,
    getURL: (path) => browserApi.runtime.getURL(path),
    now: () => Date.now(),
  });
  const handle = createHandlers({ repo, settings, openSettings });
  const guard = createMessageGuard({
    extensionId: browserApi.runtime.id,
    extensionOrigin: browserApi.runtime.getURL(''),
  });

  return async (message, sender) => {
    const verdict = guard(message, sender);
    return verdict.allowed
      ? handle(message, { origin: verdict.origin, senderKey: senderKey(sender) })
      : { ok: false, error: 'rejected' };
  };
}
