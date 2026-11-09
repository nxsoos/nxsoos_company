import { existsSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { ActiveProject } from '../../shared/companion.js';

type Target = { path: string; directory: boolean; evidence: ActiveProject['evidence'] };
type Token = { value: string; literal: boolean };
// Read literal arguments from code-mode calls without executing JavaScript. Strings,
// comments and template bodies are opaque, so a path printed inside source is not a tool call.
function tokens(code: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < Math.min(code.length, 500000);) {
    const c = code[i];
    if (/\s/.test(c)) { i++; continue; }
    if (code.startsWith('//', i)) { i = code.indexOf('\n', i); if (i < 0) break; continue; }
    if (code.startsWith('/*', i)) { const end = code.indexOf('*/', i + 2); i = end < 0 ? code.length : end + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c; let value = '', dynamic = false; i++;
      while (i < code.length && code[i] !== quote) {
        if (quote === '`' && code.startsWith('${', i)) dynamic = true;
        if (code[i] === '\\') {
          const escaped = code[++i];
          value += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string,string>)[escaped] ?? escaped ?? '';
          i++;
        } else value += code[i++];
      }
      i++;
      out.push({ value, literal: !dynamic });
    } else {
      const word = /^[A-Za-z_$][\w$]*/.exec(code.slice(i));
      out.push({ value: word?.[0] || c, literal: false });
      i += word?.[0].length || 1;
    }
  }
  return out;
}
function codeCalls(code: string): { tool: string; input: unknown }[] {
  const ts = tokens(code), calls: { tool: string; input: unknown }[] = [];
  for (let i = 0; i < ts.length - 4; i++) {
    if (ts[i].literal || ts[i].value !== 'tools' || ts[i+1].value !== '.' || ts[i+3].value !== '(') continue;
    const tool = ts[i+2].value, arg = ts[i+4];
    if (arg.literal) { calls.push({tool, input: arg.value}); continue; }
    if (arg.value !== '{') continue;
    const input: Record<string,string> = {}; let depth = 1;
    for (let j = i+5; j < ts.length && depth; j++) {
      if (ts[j].value === '{' && !ts[j].literal) depth++;
      if (ts[j].value === '}' && !ts[j].literal) depth--;
      if (depth === 1 && ts[j+1]?.value === ':' && ts[j+2]?.literal)
        input[ts[j].value] = ts[j+2].value;
    }
    calls.push({tool, input});
  }
  return calls;
}
export function toolTargets(tool: string, raw: unknown): Target[] {
  let input: any = raw;
  if (typeof raw === 'string' && raw.trimStart().startsWith('{')) {
    try { input = JSON.parse(raw); } catch { /* A raw patch or code call stays opaque. */ }
  }
  const name = tool.split('__').at(-1)!.replace(/^functions\./,'').toLowerCase();
  if (name === 'exec' || name === 'functions.exec')
    return codeCalls(typeof input === 'string' ? input : input?.code || input?.input || '')
      .flatMap(call => toolTargets(call.tool, call.input));
  if (/apply_patch/.test(name)) {
    const patch = typeof input === 'string' ? input : input?.patch || input?.input || input?.command;
    if (typeof patch !== 'string') return [];
    return [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/gm)]
      .map(match => ({path: match[1].trim(), directory:false, evidence:'file-target' as const}));
  }
  if (!input || typeof input !== 'object') return [];
  if (/^(exec_command|bash|powershell|shell|run_command|shell_command)$/.test(name)) {
    const path = input.workdir || input.cwd || input.working_directory;
    if (typeof path === 'string') return [{path, directory:true, evidence:'tool-workdir'}];
    // Only a leading explicit directory change is evidence, never arbitrary text in a command.
    const cmd = input.cmd || input.command;
    const match = typeof cmd === 'string' && /^\s*(?:cd(?:\s+\/d)?|Set-Location(?:\s+-LiteralPath)?)\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))(?:\s*(?:&&|;)|\s*$)/i.exec(cmd);
    return match ? [{path:match[1] || match[2] || match[3],directory:true,evidence:'tool-workdir'}] : [];
  }
  if (/^(read_file|read_text_file|write_file|edit_file|replace_text|view_image|project_read_file|project_write_file)$/.test(name)) {
    const path = input.path || input.file_path || input.file || input.filename;
    return typeof path === 'string' ? [{path,directory:false,evidence:'file-target'}] : [];
  }
  return [];
}

export function inferProject(tool: string, input: unknown, cwd: string, timestamp: string,
  registered: {path: string; name: string}[] = []): ActiveProject | undefined {
  const targets = toolTargets(tool, input);
  const projects = targets.flatMap(target => {
    if (!target.path || target.path.includes('\0')) return [];
    const absolute = isAbsolute(target.path) ? resolve(target.path) : cwd ? resolve(cwd,target.path) : '';
    if (!absolute) return [];
    let directory = target.directory ? absolute : dirname(absolute);
    const configured = registered.filter(project => {
      const root = resolve(project.path).toLowerCase(), candidate = absolute.toLowerCase();
      return candidate === root || candidate.startsWith(root + '/') || candidate.startsWith(root + '\\');
    }).sort((a,b) => b.path.length-a.path.length)[0];
    if (configured) return [{path:resolve(configured.path),name:configured.name,observedAt:timestamp,evidence:target.evidence}];
    for (let level = 0; level < 20; level++) {
      if (['.git','package.json','pubspec.yaml','Cargo.toml','pyproject.toml','go.mod','ProjectInfo.md'].some(marker => existsSync(join(directory,marker))))
        return [{path:directory,name:basename(directory),observedAt:timestamp,evidence:target.evidence}];
      const parent = dirname(directory); if (parent === directory) break; directory = parent;
    }
    // A real explicitly selected command directory is still useful without a manifest.
    try { if (target.directory && statSync(absolute).isDirectory())
      return [{path:absolute,name:basename(absolute),observedAt:timestamp,evidence:target.evidence}]; } catch {}
    return [];
  });
  const unique = [...new Map(projects.map(project => [project.path.toLowerCase(),project])).values()];
  // A cross-project batch is ambiguous; never silently choose the last path in source text.
  return unique.length === 1 ? unique[0] : undefined;
}
