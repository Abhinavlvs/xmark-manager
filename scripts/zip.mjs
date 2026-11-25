/**
 * Minimal zero-dependency ZIP writer/reader (deflate, UTF-8 names, fixed timestamp so output is
 * byte-identical across runs). Files are stored as Unix 0644, directory entries (names ending in
 * "/") as 0755. Enough for extension bundles; not a general ZIP library.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { listFiles } from './build.mjs';
import { join } from 'node:path';

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1; // 2020-01-01

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function header(size, fill) {
  const b = Buffer.alloc(size);
  fill(b);
  return b;
}

/** @param {{name: string, data: Buffer}[]} files in the order they should appear */
export function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const isDir = name.endsWith('/');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = header(30, (b) => {
      b.writeUInt32LE(0x04034b50, 0);
      b.writeUInt16LE(20, 4); // version needed
      b.writeUInt16LE(0x0800, 6); // UTF-8 names
      b.writeUInt16LE(8, 8); // deflate
      b.writeUInt16LE(DOS_TIME, 10);
      b.writeUInt16LE(DOS_DATE, 12);
      b.writeUInt32LE(crc, 14);
      b.writeUInt32LE(packed.length, 18);
      b.writeUInt32LE(data.length, 22);
      b.writeUInt16LE(nameBuf.length, 26);
    });
    const central = header(46, (b) => {
      b.writeUInt32LE(0x02014b50, 0);
      b.writeUInt16LE(0x0314, 4); // made by Unix (3), spec 2.0 (20)
      b.writeUInt16LE(20, 6);
      b.writeUInt16LE(0x0800, 8);
      b.writeUInt16LE(8, 10);
      b.writeUInt16LE(DOS_TIME, 12);
      b.writeUInt16LE(DOS_DATE, 14);
      b.writeUInt32LE(crc, 16);
      b.writeUInt32LE(packed.length, 20);
      b.writeUInt32LE(data.length, 24);
      b.writeUInt16LE(nameBuf.length, 28);
      b.writeUInt32LE(isDir ? ((0o040755 << 16) | 0x10) >>> 0 : (0o100644 << 16) >>> 0, 38);
      b.writeUInt32LE(offset, 42);
    });
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = header(22, (b) => {
    b.writeUInt32LE(0x06054b50, 0);
    b.writeUInt16LE(files.length, 8);
    b.writeUInt16LE(files.length, 10);
    b.writeUInt32LE(centralBuf.length, 12);
    b.writeUInt32LE(offset, 16);
  });
  return Buffer.concat([...locals, centralBuf, end]);
}

/** Reads back what createZip writes (central directory walk); verifies CRCs. */
export function readZipEntries(zip) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip archive');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const versionMadeBy = zip.readUInt16LE(p + 4);
    const externalAttrs = zip.readUInt32LE(p + 38);
    const crc = zip.readUInt32LE(p + 16);
    const packedSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localAt = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const data = inflateRawSync(zip.subarray(dataAt, dataAt + packedSize));
    if (crc32(data) !== crc) throw new Error(`bad CRC for ${name}`);
    entries.push({ name, data, versionMadeBy, externalAttrs });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Zips every file under `dir` (sorted, POSIX paths relative to `dir`) into `zipPath`. */
export async function zipDirectory(dir, zipPath) {
  const names = await listFiles(dir);
  const files = [];
  for (const name of names) files.push({ name, data: await readFile(join(dir, name)) });
  await writeFile(zipPath, createZip(files));
}
