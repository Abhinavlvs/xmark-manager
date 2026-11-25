/**
 * Opens the options page on the Folders screen in a new tab (OPEN_FOLDER_SETTINGS).
 * `tabs.create` needs no `tabs` permission, but finding an already open options tab would
 * (tabs.query by URL), so a new tab is always opened. At most one open per sender per window of
 * `minGapMs`; later requests inside it succeed without opening anything (no tab spam). In memory only.
 */

import { SettingsUnavailableError } from '../core/errors.js';

export const FOLDER_SETTINGS_PATH = 'options/options.html#folders-add';
const MAX_KEYS = 50;

/**
 * @param {{tabs?: {create(opts: {url: string}): Promise<unknown>}, getURL(path: string): string,
 *   now(): number, minGapMs?: number}} deps
 * @returns {(senderKey: string) => Promise<void>}
 */
export function createSettingsOpener({ tabs, getURL, now, minGapMs = 2000 }) {
  const last = new Map();
  return async (senderKey) => {
    const t = now();
    const prev = last.get(senderKey);
    if (prev !== undefined && t - prev < minGapMs) return;
    for (const [key, at] of last) if (t - at >= minGapMs) last.delete(key);
    if (last.size >= MAX_KEYS) return; // far more senders than tabs the user has; stay quiet
    last.set(senderKey, t);
    try {
      await tabs.create({ url: getURL(FOLDER_SETTINGS_PATH) });
    } catch {
      last.delete(senderKey);
      throw new SettingsUnavailableError('Could not open the settings page');
    }
  };
}
