import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  copyFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { findCodex, TESTED_CODEX_VERSION } from './codex.js';
import { atomicJson, atomicText, bridgeToken, codexDirectory, digest, readJson } from './local.js';
import { employees, roleGuidance } from '../shared/agents.js';
export interface IntegrationManifest {
  id: string;
  installed: boolean;
  installedAt: string;
  version: string;
  codexHome: string;
  hooksFile: string;
  hookGroups: Record<string, any>;
  files: { path: string; hash: string }[];
  cliVerified?: boolean;
  ideVerified?: boolean;
}
export const hookEvents = [
  'SessionStart',
  'UserPromptSubmit',
  'PreModelRequest',
  'PostModelRequest',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'Interrupt',
  'SessionEnd',
];
export function integrationStatus(directory: string) {
  const m = readJson<IntegrationManifest>(join(directory, 'integration.json'));
  let hooksEnabled: boolean | null = null;
  try {
    const config: any = parse(
      readFileSync(join(m?.codexHome || codexDirectory(), 'config.toml'), 'utf8'),
    );
    hooksEnabled = config.features?.hooks !== false;
  } catch {}
  return {
    installed: !!m?.installed,
    installedAt: m?.installedAt,
    version: m?.version,
    hooksEnabled,
    cli: m?.cliVerified ? ('verified' as const) : ('unverified' as const),
    ide: m?.ideVerified ? ('verified' as const) : ('unverified' as const),
    notes: [
      !m?.installed
        ? 'Run npm run codex:link once.'
        : 'Review/trust the Nxsoos hooks using /hooks in Codex. Restart or resume existing sessions.',
      ...(hooksEnabled === false
        ? ['Your user configuration disables hooks. Enable them in Codex before expecting events.']
        : []),
      'CLI and IDE capture are verified independently.',
    ],
  };
}
export function hookCommand(
  executable: string,
  hookFile: string,
  directory: string,
  platform = process.platform,
) {
  if ([executable, hookFile, directory].some((value) => /[\r\n\0]/.test(value)))
    throw new Error('Unsupported newline or null in integration path.');
  if (platform === 'win32') {
    const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const invocation = `& ${literal(executable)} ${literal(hookFile)} --data-dir ${literal(directory)}`;
    // Codex uses PowerShell on this Windows installation, independently of the launching terminal.
    // Encoding keeps paths containing spaces, apostrophes, $, or backticks literal through either
    // PowerShell or cmd.exe, and does not change Codex's native hook trust requirements.
    return (
      'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ' +
      Buffer.from(invocation, 'utf16le').toString('base64')
    );
  }
  const literal = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return `${literal(executable)} ${literal(hookFile)} --data-dir ${literal(directory)}`;
}
export function linkIntegration(
  directory: string,
  options: { codexHome?: string; hookFile?: string; version?: string } = {},
) {
  const home = resolve(options.codexHome || codexDirectory());
  const version =
    options.version ||
    execFileSync(findCodex(), ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
  if (version !== TESTED_CODEX_VERSION)
    throw new Error(`Unsupported Codex: ${version}. Expected ${TESTED_CODEX_VERSION}.`);
  const hookFile = resolve(options.hookFile || 'dist-server/hook.js');
  if (!existsSync(hookFile)) throw new Error('Build the application before linking Codex.');
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(home, 'agents'), { recursive: true });
  bridgeToken(directory);
  const previous = readJson<IntegrationManifest>(join(directory, 'integration.json'));
  if (previous?.installed && previous.codexHome !== home)
    throw new Error('Unlink the previous Codex home before linking a different one.');
  const hooksFile = join(home, 'hooks.json');
  const configFile = join(home, 'config.toml');
  const config = existsSync(configFile) ? readFileSync(configFile, 'utf8') : '';
  // Preserve existing inline hooks by using that representation if it is already present.
  const inline = /^\s*\[\[?hooks(?:\.|\])/m.test(config) && !existsSync(hooksFile);
  const target = inline ? configFile : hooksFile;
  const backup = join(
    directory,
    'integration-backups',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  mkdirSync(backup, { recursive: true });
  if (existsSync(target)) copyFileSync(target, join(backup, inline ? 'config.toml' : 'hooks.json'));
  const command = hookCommand(process.execPath, hookFile, resolve(directory));
  const groups = Object.fromEntries(
    hookEvents.map((event) => [
      event,
      {
        hooks: [
          {
            type: 'command',
            command,
            timeout: 3,
            ...(event === 'SessionStart' ||
            event === 'UserPromptSubmit' ||
            event === 'SubagentStart'
              ? { additionalContextLimit: 2500 }
              : {}),
          },
        ],
      },
    ]),
  );
  const agentFiles: { path: string; hash: string; content: string }[] = [];
  for (const employee of employees.filter((e) => e.id !== 'ceo')) {
    const file = join(home, 'agents', `nxsoos_${employee.id}.toml`);
    const content = `# Managed by Nxsoos Company.\nname = ${JSON.stringify('nxsoos_' + employee.id)}\ndescription = ${JSON.stringify(employee.name + ': ' + employee.title)}\ndeveloper_instructions = ${JSON.stringify(roleGuidance[employee.id] + ' Use native Codex tools and respect all parent-session permissions. Do not create further subagents.')}\n`;
    if (
      existsSync(file) &&
      !previous?.files.some((f) => f.path === file && digest(readFileSync(file, 'utf8')) === f.hash)
    )
      throw new Error(`Preserving an existing or manually modified agent: ${file}`);
    agentFiles.push({ path: file, content, hash: digest(content) });
  }
  if (inline) {
    const start = '# BEGIN NXSOOS COMPANY HOOKS';
    const end = '# END NXSOOS COMPANY HOOKS';
    let text = config;
    if (text.includes(start)) {
      const owned = previous?.hookGroups.__inline;
      const current = text.slice(text.indexOf(start), text.indexOf(end) + end.length);
      if (!owned || digest(current) !== owned.hash)
        throw new Error('Company hook block was manually changed; preserving it.');
      text = text.replace(current, '');
    }
    const block =
      start +
      '\n' +
      hookEvents
        .map(
          (event) =>
            `[[hooks.${event}]]\n[[hooks.${event}.hooks]]\ntype = "command"\ncommand = ${JSON.stringify(command)}\ntimeout = 3\n${['SessionStart', 'UserPromptSubmit', 'SubagentStart'].includes(event) ? 'additionalContextLimit = 2500\n' : ''}`,
        )
        .join('\n') +
      end;
    parse(text + '\n' + block);
    atomicText(target, text.trimEnd() + '\n\n' + block + '\n');
    (groups as any).__inline = { hash: digest(block) };
  } else {
    const hooks: any = existsSync(hooksFile)
      ? JSON.parse(readFileSync(hooksFile, 'utf8'))
      : { hooks: {} };
    hooks.hooks ||= {};
    for (const event of hookEvents) {
      const existing = hooks.hooks[event] || [];
      const old = previous?.hookGroups[event];
      if (
        old &&
        existing.some(
          (g: any) =>
            g.hooks?.some((h: any) => h.command === old.hooks[0].command) &&
            JSON.stringify(g) !== JSON.stringify(old),
        )
      )
        throw new Error(
          'Company hook definition was manually changed; preserving it. Unlink or restore it before updating.',
        );
      hooks.hooks[event] = existing.filter(
        (g: any) => !old || JSON.stringify(g) !== JSON.stringify(old),
      );
      if (!hooks.hooks[event].some((g: any) => JSON.stringify(g) === JSON.stringify(groups[event])))
        hooks.hooks[event].push(groups[event]);
    }
    atomicJson(hooksFile, hooks);
  }
  for (const file of agentFiles) {
    if (existsSync(file.path))
      copyFileSync(file.path, join(backup, file.path.split(/[\\/]/).at(-1)!));
    atomicText(file.path, file.content);
  }
  const manifest: IntegrationManifest = {
    id: previous?.installed ? previous.id : digest(resolve(directory) + Date.now()),
    installed: true,
    installedAt: previous?.installed ? previous.installedAt : new Date().toISOString(),
    version,
    codexHome: home,
    hooksFile: target,
    hookGroups: groups,
    files: agentFiles.map(({ path, hash }) => ({ path, hash })),
    cliVerified: previous?.installed ? previous.cliVerified : false,
    ideVerified: previous?.installed ? previous.ideVerified : false,
  };
  atomicJson(join(directory, 'integration.json'), manifest);
  return manifest;
}
export function unlinkIntegration(directory: string) {
  const file = join(directory, 'integration.json');
  const manifest = readJson<IntegrationManifest>(file);
  const preserved: string[] = [];
  if (!manifest?.installed) return { removed: false, preserved };
  if (manifest.hookGroups.__inline && existsSync(manifest.hooksFile)) {
    const text = readFileSync(manifest.hooksFile, 'utf8');
    const start = text.indexOf('# BEGIN NXSOOS COMPANY HOOKS');
    const end = text.indexOf('# END NXSOOS COMPANY HOOKS');
    const block = text.slice(start, end + '# END NXSOOS COMPANY HOOKS'.length);
    if (start >= 0 && end >= 0 && digest(block) === manifest.hookGroups.__inline.hash)
      atomicText(manifest.hooksFile, text.replace(block, ''));
    else preserved.push(manifest.hooksFile);
  } else if (existsSync(manifest.hooksFile)) {
    const data = JSON.parse(readFileSync(manifest.hooksFile, 'utf8'));
    for (const event of hookEvents)
      if (data.hooks?.[event])
        data.hooks[event] = data.hooks[event].filter(
          (g: any) => JSON.stringify(g) !== JSON.stringify(manifest.hookGroups[event]),
        );
    atomicJson(manifest.hooksFile, data);
  }
  for (const f of manifest.files)
    if (existsSync(f.path)) {
      if (digest(readFileSync(f.path, 'utf8')) === f.hash) unlinkSync(f.path);
      else preserved.push(f.path);
    }
  atomicJson(file, { ...manifest, installed: false });
  return { removed: true, preserved };
}
