/**
 * Throwaway self-signed certificate for the local x.com stand-ins (Firefox proxy and Chromium
 * host-resolver). Needs `openssl`. The files live in a temp dir that `remove()` deletes.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @returns {{key: Buffer, cert: Buffer, spkiSha256: string, remove: () => void}} */
export function createThrowawayCert() {
  const dir = mkdtempSync(join(tmpdir(), 'xmark-e2e-tls-'));
  const keyFile = join(dir, 'k.pem');
  const certFile = join(dir, 'c.pem');
  execFileSync(
    'openssl',
    [
      ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=x.com'],
      ...['-keyout', keyFile, '-out', certFile],
    ],
    { stdio: 'ignore' },
  );
  // base64 of the SHA-256 of the DER SubjectPublicKeyInfo: the format of Chrome's
  // --ignore-certificate-errors-spki-list.
  const pubkey = execFileSync('openssl', ['x509', '-in', certFile, '-pubkey', '-noout']);
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: pubkey });
  const digest = execFileSync('openssl', ['dgst', '-sha256', '-binary'], { input: der });
  return {
    key: readFileSync(keyFile),
    cert: readFileSync(certFile),
    spkiSha256: digest.toString('base64'),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
