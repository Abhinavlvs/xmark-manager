/**
 * Hash router: `#folders` selects a section; back and forward work through `hashchange`.
 */

/**
 * @param {{win: {location: {hash: string}, addEventListener: Function},
 *   routes: string[], onRoute: (name: string, opts?: {add?: boolean}) => void}} deps
 */
const args = ({ name, add }) => (add ? [name, { add }] : [name]);

export function createRouter({ win, routes, onRoute }) {
  // `folders-add` is `folders` plus "put the cursor in the add field" (link from the save panel).
  const current = () => {
    const raw = String(win.location.hash ?? '').replace(/^#/, '');
    const add = raw.endsWith('-add');
    const name = add ? raw.slice(0, -4) : raw;
    return routes.includes(name) ? { name, add } : { name: routes[0], add: false };
  };
  return {
    start() {
      win.addEventListener('hashchange', () => onRoute(...args(current())));
      onRoute(...args(current()));
    },
    /** @param {string} name */
    go(name) {
      win.location.hash = name;
    },
  };
}
