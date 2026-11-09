import { realpath, stat, readdir, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const denied = new Set([
  '.git',
  '.aws',
  '.ssh',
  '.codex',
  '.agents',
  'node_modules',
  '.env',
  '.runtime',
  'dist',
  'build',
]);
export const hash = (content: string) => createHash('sha256').update(content).digest('hex');
export async function canonicalProject(input: string) {
  if (!path.isAbsolute(input)) throw new Error('Choose an absolute project folder.');
  const root = await realpath(input);
  if (!(await stat(root)).isDirectory()) throw new Error('Project must be a folder.');
  if (root === path.parse(root).root)
    throw new Error('Register a project folder, not a whole drive.');
  return root;
}
export async function scopedPath(
  root: string,
  relative: string,
  creating = false,
): Promise<string> {
  if (
    path.isAbsolute(relative) ||
    relative.includes('\0') ||
    relative.includes(':') ||
    relative.split(/[\\/]/).some((s) => {
      const part = s.toLowerCase().replace(/[. ]+$/, '');
      return (
        denied.has(part) ||
        part.startsWith('.env') ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/.test(part)
      );
    })
  )
    throw new Error('Path is outside allowed project content.');
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))
    throw new Error('Path escapes the selected project.');
  let cursor = root;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error('Symbolic links and junctions are not allowed.');
    } catch (e: any) {
      if (creating && e.code === 'ENOENT') continue;
      throw e;
    }
  }
  if (!creating) {
    const actual = await realpath(target);
    const check = path.relative(root, actual);
    if (check.startsWith('..') || path.isAbsolute(check)) throw new Error('Path escapes project.');
  }
  return target;
}
export async function listFiles(root: string, relative = '.', depth = 0): Promise<string[]> {
  const folder = await scopedPath(root, relative);
  const result: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (
      denied.has(entry.name.toLowerCase()) ||
      entry.name.toLowerCase().startsWith('.env') ||
      entry.isSymbolicLink()
    )
      continue;
    const rel = path.relative(root, path.join(folder, entry.name));
    if (entry.isDirectory()) {
      result.push(rel + '/');
      if (depth < 3) result.push(...(await listFiles(root, rel, depth + 1)));
    } else result.push(rel);
    if (result.length >= 700) break;
  }
  return result.slice(0, 700);
}
export async function readScoped(root: string, relative: string) {
  const file = await scopedPath(root, relative);
  if ((await stat(file)).size > 512000) throw new Error('File exceeds the 500 KB reading limit.');
  const content = await readFile(file, 'utf8');
  if (content.includes('\0')) throw new Error('Binary files cannot be read as text.');
  return { path: relative, content, hash: hash(content) };
}
export async function writeScoped(
  root: string,
  relative: string,
  content: string,
  expectedHash: string | null,
) {
  const file = await scopedPath(root, relative, true);
  let before = '';
  let exists = true;
  try {
    before = await readFile(file, 'utf8');
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
    exists = false;
  }
  if ((exists && expectedHash !== hash(before)) || (!exists && expectedHash !== null))
    throw new Error(
      'CONFLICT: File changed or was not read first. Re-read it and preserve user changes.',
    );
  if (Buffer.byteLength(content) > 512000) throw new Error('Write exceeds 500 KB.');
  await mkdir(path.dirname(file), { recursive: true });
  // Recheck existing directories after creation to reject junction substitution.
  await scopedPath(root, relative, true);
  await writeFile(file, content, 'utf8');
  return { path: relative, before, after: content, hash: hash(content) };
}
