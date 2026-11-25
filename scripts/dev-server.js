/**
 * Zero-dependency static server for developing the UI without Firefox.
 * Serves src/ at "/" and dev/ at "/dev/". Bound to 127.0.0.1 only. Not shipped (outside src/).
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * @param {{srcDir?: string, devDir?: string}} [dirs]
 */
export function createDevServer({
  srcDir = resolve(ROOT, 'src'),
  devDir = resolve(ROOT, 'dev'),
} = {}) {
  /** Map a URL path to a file under one of the roots, or null if it escapes them. */
  function locate(pathname) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    if (decoded.includes('\0')) return null;
    const inDev = decoded.startsWith('/dev/');
    const base = inDev ? devDir : srcDir;
    const rel = inDev ? decoded.slice('/dev'.length) : decoded;
    const file = resolve(base, `.${rel}`);
    return file.startsWith(base + sep) ? file : null;
  }

  return createServer(async (req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method Not Allowed');
    const file = locate(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (!file) return send(404, 'Not found');
    try {
      if (!(await stat(file)).isFile()) return send(404, 'Not found');
      const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
      return send(200, await readFile(file), type);
    } catch {
      return send(404, 'Not found');
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || 5173;
  createDevServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`xmark-manager dev server: http://127.0.0.1:${port}/dev/popup.html\n`);
  });
}
