import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
export const defaultDirectory = () =>
  resolve(
    process.env.COMPANY_DATA_DIR ||
      join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'AICompany'),
  );
export const codexDirectory = () => resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function readJson<T = any>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}
export function atomicJson(file: string, data: unknown) {
  atomicText(file, JSON.stringify(data, null, 2));
}
export function atomicText(file: string, data: string) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  const temporary = file + '.' + randomBytes(6).toString('hex') + '.tmp';
  writeFileSync(temporary, data, { mode: 0o600 });
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(temporary, file);
      return;
    } catch (error: any) {
      if (
        process.platform === 'win32' &&
        ['EPERM', 'EBUSY', 'EACCES'].includes(error.code) &&
        attempt < 5
      ) {
        // Windows readers/scanners can briefly hold the destination without delete sharing.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
        continue;
      }
      try {
        unlinkSync(temporary);
      } catch {}
      throw error;
    }
  }
}
export function bridgeToken(directory: string) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'bridge-token');
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  return readFileSync(file, 'utf8').trim();
}
export function redact(input: unknown, depth = 0): any {
  if (depth > 12) return '[nested content omitted]';
  if (typeof input === 'string')
    return input
      .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
      .replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [redacted]')
      .replace(
        /((?:access_token|refresh_token|api_key|password|client_secret)["']?\s*[:=]\s*["']?)[^\s,"'\n}]+/gi,
        '$1[redacted]',
      )
      .slice(0, 120000);
  if (Array.isArray(input)) return input.slice(0, 300).map((v) => redact(v, depth + 1));
  if (input && typeof input === 'object')
    return Object.fromEntries(
      Object.entries(input)
        .filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k))
        .map(([k, v]) => [
          k,
          /^(authorization|cookie|set-cookie|access_token|refresh_token|api_key|password|client_secret)$/i.test(
            k,
          )
            ? '[redacted]'
            : redact(v, depth + 1),
        ]),
    );
  return input;
}
