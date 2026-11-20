// Node-side data getter for tests and offline scripts.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'data');

export function nodeGetter(base = DATA) {
  return async (p) => {
    const buf = await readFile(path.join(base, p));
    if (p.endsWith('.bin')) return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return JSON.parse(buf.toString('utf8'));
  };
}
