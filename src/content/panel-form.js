/**
 * Pure-DOM pieces of the save panel: form fields, error text, tag parsing, small states.
 * Every dynamic string goes through textContent.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const MAX_TAGS = 20;
  const MAX_NOTES = 5000;
  // Snippet length limits: kept equal to src/core/snippet.js by tests/content/snippet-constants.test.js.
  const SNIPPET_MIN = 35;
  const SNIPPET_MAX = 280;
  const SNIPPET_DEFAULT = 280;
  /** The length to cut to: a number rounded and clamped to 35..280; anything else is 280. */
  function snippetLength(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return SNIPPET_DEFAULT;
    return Math.min(SNIPPET_MAX, Math.max(SNIPPET_MIN, Math.round(value)));
  }
  const FALLBACK = 'Something went wrong. Please try again.';
  const ERRORS = Object.freeze({
    InvalidPostUrlError: 'This does not look like a post that can be saved.',
    NotFoundError: 'That folder no longer exists. Pick another one.',
    rejected: 'Saving is not allowed here (private windows are never saved).',
    internal_error: FALLBACK,
    bad_payload: 'Some of the details are not valid. Check them and try again.',
    storage_full:
      "Couldn't save. Your library may be full. Export a backup from Options > Data, then delete old posts.",
    storage_error: "Couldn't save. Try again.",
    storage_read_error: "Couldn't read your library. Try reloading the extension.",
    storage_unreadable:
      "Your saved library can't be read right now. Export your data or reload the extension.",
  });

  const parseTags = (value) =>
    Array.from(new Set(value.split(/[\s,]+/).filter(Boolean))).slice(0, MAX_TAGS);

  function field(doc, label, control) {
    const wrap = ns.el(doc, 'label', { class: 'xm-field' });
    wrap.appendChild(ns.el(doc, 'span', {}, label));
    wrap.appendChild(control);
    return wrap;
  }

  function buildForm(doc, folders) {
    const select = ns.el(doc, 'select');
    select.appendChild(ns.el(doc, 'option', { value: '' }, 'Uncategorised'));
    for (const f of folders) {
      if (f && typeof f.id === 'string' && typeof f.name === 'string') {
        select.appendChild(ns.el(doc, 'option', { value: f.id }, f.name));
      }
    }
    ns.panelFolder.addOption(doc, select);
    const { hint, status } = ns.panelFolder.extras(doc, select);
    const tags = ns.el(doc, 'input', {
      type: 'text',
      placeholder: 'tag, tag',
      autocomplete: 'off',
    });
    const notes = ns.el(doc, 'textarea', { maxlength: MAX_NOTES, placeholder: 'Why save this?' });
    const rows = [field(doc, 'Folder', select), hint, status];
    rows.push(field(doc, 'Tags', tags), field(doc, 'Notes', notes));
    return { select, status, tags, notes, rows };
  }

  function renderSaved(doc, panel) {
    ns.clear(panel);
    const line = ns.el(doc, 'p', { class: 'xm-saved', role: 'status' });
    line.appendChild(ns.createCheck(doc));
    line.appendChild(ns.el(doc, 'span', {}, 'Saved'));
    panel.appendChild(line);
  }

  /** Shown when the post cannot be read; the Close button is the focus target. */
  function renderUnreadable(doc, panel) {
    panel.appendChild(
      ns.el(doc, 'p', { class: 'xm-alert', role: 'alert' }, 'Could not read this post.'),
    );
    const close = ns.el(doc, 'button', { type: 'button', class: 'xm-close' }, 'Close');
    panel.appendChild(close);
    return close;
  }

  ns.panelForm = {
    MAX_NOTES,
    SNIPPET_MIN,
    SNIPPET_MAX,
    SNIPPET_DEFAULT,
    snippetLength,
    FALLBACK,
    ERRORS,
    parseTags,
    buildForm,
    renderSaved,
    renderUnreadable,
  };
})();
