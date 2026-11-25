/**
 * Styles injected into each shadow root, so nothing leaks into or out of X's page.
 * Tokens mirror src/ui/theme.css (X dark): bg #000, border #2f3336, text #e7e9ea, muted #71767b.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});

  ns.styles = `
:host { display: inline-flex; align-items: center; position: relative; margin-left: 4px; }
* { box-sizing: border-box; }
.xm-btn { position: relative; width: 40px; height: 34px; padding: 0; border: 0; border-radius: 9999px; background: transparent;
  color: #71767b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.xm-btn:hover, .xm-btn[aria-expanded="true"], .xm-btn[data-saved="true"] { color: #1d9bf0; }
.xm-btn:hover { background: rgba(29, 155, 240, 0.1); }
.xm-btn:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 0; }
.xm-btn .xm-mark { width: 24px; height: 15px; display: block; }
.xm-btn .xm-badge { position: absolute; right: 1px; bottom: 1px; width: 12px; height: 12px; display: block;
  border-radius: 9999px; box-shadow: 0 0 0 1.5px #000; }
@media (prefers-reduced-motion: reduce) { .xm-btn { transition: none; } }
`;

  // The panel lives in its own host and root, so it carries its own copy of the base rules.
  ns.panelStyles = `
* { box-sizing: border-box; }
.xm-panel { position: static; width: 100%; max-height: calc(100vh - 16px); overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
  background: #000; color: #e7e9ea; border: 1px solid #2f3336; border-radius: 16px;
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.2); font: 400 15px/1.33 -apple-system, BlinkMacSystemFont,
  'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: left; animation: xm-fade 120ms ease-out; }
@keyframes xm-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .xm-panel { animation: none; } .xm-primary { transition: none; } }
.xm-close { align-self: flex-end; height: 36px; padding: 0 16px; background: transparent; color: #e7e9ea;
  border: 1px solid #536471; border-radius: 9999px; font: inherit; font-weight: 700; cursor: pointer; }
.xm-close:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 1px; }
.xm-title { margin: 0; font-size: 17px; font-weight: 700; }
.xm-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #71767b; }
.xm-field select, .xm-field input, .xm-field textarea { width: 100%; padding: 8px 10px; background: #000;
  color: #e7e9ea; border: 1px solid #2f3336; border-radius: 8px; font: inherit; }
.xm-hint { margin: -6px 0 0; font-size: 13px; color: #71767b; }
.xm-hint:empty { display: none; }
.xm-field textarea { min-height: 72px; resize: vertical; }
.xm-field select:focus-visible, .xm-field input:focus-visible, .xm-field textarea:focus-visible,
.xm-primary:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 1px; border-color: #1d9bf0; }
.xm-field ::placeholder { color: #71767b; opacity: 1; }
.xm-actions { display: flex; justify-content: flex-end; }
.xm-primary { min-width: 84px; height: 36px; padding: 0 18px; border: 0; border-radius: 9999px;
  background: #1d9bf0; color: #fff; font-family: inherit; font-size: 15px; font-weight: 700; line-height: 1; cursor: pointer; }
.xm-primary:hover:not(:disabled) { background: #1a8cd8; }
.xm-primary:disabled { opacity: 0.6; cursor: default; }
.xm-alert { margin: 0; color: #f4212e; font-size: 13px; }
.xm-saved { margin: 0; display: flex; align-items: center; gap: 8px; color: #00ba7c; font-weight: 700; }
.xm-saved svg { width: 20px; height: 20px; }
`;
})();
