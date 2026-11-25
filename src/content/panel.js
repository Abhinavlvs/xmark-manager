/**
 * The save panel lifecycle. Opens on a trusted click in its own top-level fixed host (see
 * panel-host.js), anchored to the button's viewport rect. The post is read here and only here,
 * once per click, for one post.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const { MSG } = ns;
  const CLOSE_DELAY_MS = 1200;
  const LABEL = 'Save to xmark-manager';

  let current = null;
  let ticket = 0;

  const { send } = ns;

  const focusNoScroll = (el) => el?.focus({ preventScroll: true });

  /** @param {{focus?: boolean}} [opts] return focus to the button only when asked. */
  function closeCurrent({ focus = false } = {}) {
    if (!current) return;
    const { button, cleanup, timer } = current;
    current = null;
    ticket += 1;
    cleanup();
    if (timer) clearTimeout(timer);
    ns.panelHost.remove();
    button.setAttribute('aria-expanded', 'false');
    if (focus) focusNoScroll(button);
  }

  /** Both our hosts (the in-article button and the panel) count as ours. */
  const insideOurs = (target) =>
    !!current &&
    [current.host, current.panelHost, current.root, current.panelRoot].some(
      (h) => target === h || h.contains?.(target) === true,
    );

  function onKeydown(event) {
    // Only an Escape that happens in our UI closes it; unrelated page Escapes are left alone.
    if (event.key === 'Escape' && insideOurs(event.target)) closeCurrent({ focus: true });
  }

  function onOutside(event) {
    if (current && !insideOurs(event.target)) closeCurrent();
  }

  const place = () =>
    current && ns.applyPlacement(current.panel, current.button, current.panelHost);

  /** Scroll/resize: follow the anchor, or close when it is gone or scrolled out of view. */
  function reposition() {
    if (!current) return;
    const { host, button } = current;
    if (host.isConnected === false || button.isConnected === false || !ns.anchorVisible(button)) {
      closeCurrent();
      return;
    }
    place();
  }

  function present(ctx, panel) {
    const { doc, button } = ctx;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', LABEL);
    const { host: panelHost, root: panelRoot } = ns.panelHost.create(doc, () =>
      closeCurrent({ focus: true }),
    );
    panelRoot.appendChild(panel);
    button.setAttribute('aria-expanded', 'true');
    doc.addEventListener('keydown', onKeydown, true);
    doc.addEventListener('pointerdown', onOutside, true);
    const stopWatching = ns.panelHost.watch(doc, reposition);
    current = {
      ...ctx,
      panel,
      panelHost,
      panelRoot,
      timer: null,
      cleanup: () => {
        doc.removeEventListener('keydown', onKeydown, true);
        doc.removeEventListener('pointerdown', onOutside, true);
        stopWatching();
      },
    };
  }

  function renderForm(ctx, panel, post, preview, folders) {
    const { doc, host, button } = ctx;
    const F = ns.panelForm;
    const form = F.buildForm(doc, folders);
    const alert = ns.el(doc, 'p', { class: 'xm-alert', role: 'alert' });
    alert.hidden = true;
    const save = ns.el(doc, 'button', { type: 'button', class: 'xm-primary' }, 'Save');
    const actions = ns.el(doc, 'div', { class: 'xm-actions' });
    actions.appendChild(save);
    panel.appendChild(ns.el(doc, 'h2', { class: 'xm-title' }, 'Save post'));
    for (const row of form.rows) panel.appendChild(row);
    panel.append(alert, actions);

    ns.panelFolder.wire(form, {
      showError: (text) => {
        alert.textContent = text;
        alert.hidden = false;
        place();
      },
      opened: () => closeCurrent({ focus: true }),
    });

    let busy = false;
    save.addEventListener('click', async (event) => {
      if (!event.isTrusted || busy) return;
      busy = true;
      save.disabled = true;
      save.textContent = 'Saving…';
      alert.hidden = true;
      const payload = {
        url: post.url,
        folderId: ns.panelFolder.folderIdOf(form.select),
        tags: F.parseTags(form.tags.value),
        notes: form.notes.value.slice(0, F.MAX_NOTES),
      };
      if (preview) payload.textPreview = preview;
      const res = await send(MSG.SAVE_POST, payload);
      busy = false;
      if (res.ok) {
        ns.markSaved(host, button);
        if (current?.panel !== panel) return;
        F.renderSaved(doc, panel);
        current.timer = setTimeout(() => closeCurrent({ focus: true }), CLOSE_DELAY_MS);
        return;
      }
      if (current?.panel !== panel) return;
      alert.textContent = Object.hasOwn(F.ERRORS, res.error) ? F.ERRORS[res.error] : F.FALLBACK;
      alert.hidden = false;
      save.disabled = false;
      save.textContent = 'Retry';
      place();
    });
    focusNoScroll(form.select);
  }

  async function open(ctx) {
    const mine = ++ticket;
    // The one and only read of the post, triggered by the user's click.
    const post = ns.extractPost(ctx.article, { includeText: false });
    const [folders, settings] = await Promise.all([send(MSG.LIST_FOLDERS), send(MSG.GET_SETTINGS)]);
    if (mine !== ticket || ctx.host.isConnected === false) return;
    const panel = ns.el(ctx.doc, 'div', { class: 'xm-panel' });
    present(ctx, panel);
    if (!post) {
      const close = ns.panelForm.renderUnreadable(ctx.doc, panel);
      close.addEventListener('click', (event) => event.isTrusted && closeCurrent({ focus: true }));
      focusNoScroll(close);
      place();
      return;
    }
    let preview = '';
    if (settings.ok && settings.data?.saveSnippets === true) {
      // X may have recycled the article during the awaits: only keep text from the same post.
      const again = ns.extractPost(ctx.article, {
        includeText: true,
        maxLength: ns.panelForm.snippetLength(settings.data.snippetLength),
      });
      if (again && again.url === post.url) preview = again.textPreview;
    }
    const list = folders.ok && Array.isArray(folders.data) ? folders.data : [];
    renderForm(ctx, panel, post, preview, list);
    place();
  }

  ns.panel = {
    toggle(ctx) {
      if (current?.host === ctx.host) return closeCurrent({ focus: true });
      closeCurrent();
      return open(ctx);
    },
    closeCurrent,
    closeIfDetached() {
      if (current && current.host.isConnected === false) closeCurrent();
    },
  };
})();
