/**
 * The "Add folder…" choice of the save panel. Creating folders is not done here: a trusted
 * choice asks the background to open the extension's settings (OPEN_FOLDER_SETTINGS, no data
 * sent) and the panel closes. Drafted tags and notes are not kept (the hint says so).
 * Text via textContent only.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const { MSG } = ns;
  const ADD_VALUE = '__xmark_add_folder__'; // cannot collide with a generated folder id
  const HINT = 'Add a folder in settings, then open Save again.';
  const OPENING = 'Opening folder settings…';
  const FAILED = 'Could not open settings. Open xmark-manager options from the toolbar.';

  /** The last option of the Folder select. */
  function addOption(doc, select) {
    select.appendChild(ns.el(doc, 'option', { value: ADD_VALUE }, 'Add folder…'));
  }

  /** The always-visible hint and the polite status line, placed under the Folder row. */
  function extras(doc, select) {
    const hint = ns.el(doc, 'p', { class: 'xm-hint', id: 'xm-folder-hint' }, HINT);
    select.setAttribute('aria-describedby', 'xm-folder-hint');
    const status = ns.el(doc, 'p', { class: 'xm-hint', role: 'status', 'aria-live': 'polite' });
    return { hint, status };
  }

  const select$ = (form) => form.select;

  /**
   * @param {{select: Element, status: Element}} form
   * @param {{showError(text: string): void, opened(): void}} hooks
   */
  function wire(form, { showError, opened }) {
    const select = select$(form);
    let previous = select.value ?? '';
    let busy = false;

    const restore = () => {
      for (const o of select.options) if (o.value !== previous) o.selected = false;
      for (const o of select.options) if (o.value === previous) o.selected = true;
    };

    async function onChange(event) {
      if (select.value !== ADD_VALUE) {
        previous = select.value ?? '';
        return;
      }
      restore(); // never stays on "Add folder…": nothing is created by choosing it
      if (!event.isTrusted || busy) return;
      busy = true;
      form.status.textContent = OPENING;
      const res = await ns.send(MSG.OPEN_FOLDER_SETTINGS);
      busy = false;
      if (res.ok) {
        opened();
        return;
      }
      form.status.textContent = '';
      showError(FAILED);
    }
    select.addEventListener('change', onChange);
  }

  /** `folderId` for SAVE_POST; the sentinel can never be sent. */
  const folderIdOf = (select) => (select.value && select.value !== ADD_VALUE ? select.value : null);

  ns.panelFolder = { ADD_VALUE, FAILED, addOption, extras, wire, folderIdOf };
})();
