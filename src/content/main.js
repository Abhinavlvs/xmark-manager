/**
 * Entry point. Starts only inside the extension (a `runtime.id` exists).
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  let inExtension = false;
  try {
    inExtension = Boolean(ns.getBrowserApi().runtime.id);
  } catch {
    // No extension API in this context: stay inert.
  }
  if (inExtension) ns.start();
})();
