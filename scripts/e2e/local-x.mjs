/**
 * Local stand-in for x.com, used by the Firefox smoke test. Nothing here talks to the internet.
 *
 * Firefox is pointed at a local proxy that tunnels EVERY https CONNECT (whatever host it names)
 * into a local TLS server which serves a copy of dev/x-fixture.html. The page URL stays
 * https://x.com/..., so the manifest's content-script match applies, but the bytes come from
 * 127.0.0.1. Plain http requests get a marker response, which lets the test prove that Firefox
 * really routes through the proxy before it ever opens an x.com URL.
 */

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createThrowawayCert } from './tls.mjs';

export const PROXY_MARKER = 'xmark-e2e-local-proxy';

/** The fixture without its dev-only scripts: the real content scripts come from the manifest. */
export function fixtureHtml(root) {
  const html = readFileSync(join(root, 'dev', 'x-fixture.html'), 'utf8');
  return html.replace(/<script\b[\s\S]*?<\/script>/g, '');
}

const listen = (server) =>
  new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => res(server.address().port));
  });

/**
 * @returns {Promise<{proxyPort: number, hosts: Set<string>, close: () => Promise<void>}>}
 *   `hosts` collects every host Firefox asked the proxy for.
 */
export async function startLocalX(root) {
  const tlsCert = createThrowawayCert();
  const page = fixtureHtml(root);
  const hosts = new Set();

  const tls = createHttpsServer({ key: tlsCert.key, cert: tlsCert.cert }, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
  });
  const tlsPort = await listen(tls);

  const proxy = createHttpServer((req, res) => {
    hosts.add(String(req.headers.host));
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(PROXY_MARKER);
  });
  proxy.on('connect', (req, socket, head) => {
    hosts.add(String(req.url));
    const upstream = connect(tlsPort, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const drop = () => {
      upstream.destroy();
      socket.destroy();
    };
    upstream.on('error', drop);
    socket.on('error', drop);
  });
  const proxyPort = await listen(proxy);

  return {
    proxyPort,
    hosts,
    close: () =>
      new Promise((res) => {
        proxy.closeAllConnections?.();
        tls.closeAllConnections?.();
        proxy.close(() => tls.close(() => res()));
      }).finally(() => tlsCert.remove()),
  };
}
