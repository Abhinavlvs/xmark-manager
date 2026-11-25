/**
 * Shared setup for the on-page panel tests: loads every content script except main.js into a
 * linkedom page, fakes the runtime and returns helpers to reach the (closed) roots.
 */
import {
  loadContent,
  ARTICLE,
  ALL_FILES,
  manualScheduler,
  installRuntime,
  tick,
  fire,
  rootOf,
} from './content.js';

export const FILES = ALL_FILES.filter((f) => f !== 'main.js');
export const FOLDERS = {
  ok: true,
  data: [
    { id: 'f1', name: 'Reading' },
    { id: 'f2', name: 'Code' },
  ],
};
export const SETTINGS = { ok: true, data: { saveSnippets: false } };
export const SAVED = { ok: true, data: { id: 'p1', folder_id: 'f1' } };

export async function setup({ routes = {}, body = ARTICLE('1') + ARTICLE('2'), beforeStart } = {}) {
  const ctx = await loadContent(FILES, body);
  const calls = installRuntime({
    LIST_FOLDERS: FOLDERS,
    GET_SETTINGS: SETTINGS,
    SAVE_POST: SAVED,
    ...routes,
  });
  beforeStart?.(ctx);
  const sched = manualScheduler();
  ctx.xmark.start({ schedule: sched.schedule });
  sched.flush();
  const hosts = ctx.document.querySelectorAll('[data-xmark-host]');
  const api = (i = 0) => {
    const root = ctx.xmark.injector.rootFor(hosts[i]);
    return {
      host: hosts[i],
      root,
      button: root.querySelector('button.xm-btn'),
      // The panel lives in its own top-level host, not in the button's root.
      panel: () => {
        const panelHost = ctx.document.querySelector('[data-xmark-panel-host]');
        return panelHost ? rootOf(panelHost).querySelector('[role="dialog"]') : null;
      },
      panelHost: () => ctx.document.querySelector('[data-xmark-panel-host]'),
    };
  };
  const open = async (i = 0) => {
    const a = api(i);
    fire(ctx.window, a.button, 'click');
    await tick();
    return a;
  };
  return { ...ctx, calls, api, open, sched };
}
