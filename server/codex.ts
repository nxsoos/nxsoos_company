import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeStatus } from '../shared/types.js';
export const TESTED_CODEX_VERSION = 'codex-cli 0.164.0-alpha.11.1';

export function findCodex() {
  if (process.env.CODEX_EXECUTABLE) return process.env.CODEX_EXECUTABLE;
  try {
    const candidate = execFileSync(
      process.platform === 'win32' ? 'where.exe' : 'which',
      ['codex'],
      { encoding: 'utf8', windowsHide: true },
    )
      .trim()
      .split(/\r?\n/)[0];
    if (candidate) return candidate;
  } catch {}
  const extensions = join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.vscode',
    'extensions',
  );
  if (existsSync(extensions))
    for (const name of readdirSync(extensions)
      .filter((x) => x.startsWith('openai.chatgpt-'))
      .sort()
      .reverse()) {
      const candidate = join(extensions, name, 'bin', 'windows-x86_64', 'codex.exe');
      if (existsSync(candidate)) return candidate;
    }
  throw new Error(
    'Codex was not found. Install the Codex CLI or set CODEX_EXECUTABLE to its executable path.',
  );
}
export class Codex extends EventEmitter {
  constructor(private options: { nativeHooks?: boolean } = {}) {
    super();
  }
  child?: ChildProcessWithoutNullStreams;
  pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  sequence = 0;
  state: RuntimeStatus = {
    state: 'disconnected',
    authenticated: false,
    verified: false,
    executable: '',
    version: '',
    message: 'Connect Codex to bring your company online.',
    models: [],
    model: '',
    rateLimits: null,
  };
  connecting?: Promise<void>;
  stopping = false;
  async connect() {
    if (this.state.state === 'ready') return;
    if (this.connecting) return this.connecting;
    this.connecting = this.start().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
  private async start() {
    this.stopping = false;
    this.state.state = 'connecting';
    this.emit('status');
    try {
      const executable = findCodex();
      this.state.executable = executable;
      this.state.version = execFileSync(executable, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim();
      if (this.state.version !== TESTED_CODEX_VERSION)
        throw new Error(
          `Untested Codex version: ${this.state.version}. This release was verified with ${TESTED_CODEX_VERSION}. Set CODEX_EXECUTABLE to that version, or regenerate the protocol types and validate the integration before updating the compatibility pin.`,
        );
      const flags = [
        'multi_agent',
        'multi_agent_v2',
        'shell_tool',
        'unified_exec',
        'code_mode',
        'apps',
        'hooks',
        'browser_use',
        'browser_use_external',
        'image_generation',
      ];
      const args = [
        'app-server',
        '--listen',
        'stdio://',
        '--enable',
        'code_mode_host',
        ...flags
          .filter((f) => !this.options.nativeHooks || f !== 'hooks')
          .flatMap((f) => ['--disable', f]),
        '-c',
        'mcp_servers={}',
        '-c',
        'web_search="disabled"',
      ];
      const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.child = child;
      child.on('error', (e) => this.fail(e));
      let diagnostic = '';
      child.stderr.on('data', (d) => {
        diagnostic = (diagnostic + String(d)).slice(-3000);
      });
      child.on('exit', () => {
        if (!this.stopping)
          this.fail(
            new Error(
              'Codex disconnected. ' +
                diagnostic.replace(/(?:sk-|Bearer\s+)\S+/gi, '[redacted]').slice(-700),
            ),
          );
      });
      createInterface({ input: child.stdout }).on('line', (line) => {
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
          const pending = this.pending.get(Number(msg.id));
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(Number(msg.id));
          if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else pending.resolve(msg.result);
        } else if (msg.id !== undefined && msg.method) this.emit('request', msg);
        else if (msg.method) this.emit('notification', msg.method, msg.params || {});
      });
      await this.rpc('initialize', {
        clientInfo: { name: 'nxsoos_company', title: 'Nxsoos Company', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      });
      this.send({ method: 'initialized' });
      await this.refreshAccount();
      const models = await this.rpc('model/list', { limit: 100, includeHidden: false });
      this.state.models = (models.data || []).map((m: any) => ({
        id: m.model || m.id,
        name: m.displayName || m.model || m.id,
      }));
      this.state.model = (models.data || []).find((m: any) => m.isDefault)?.model || '';
      this.state.state = 'ready';
      this.state.message = this.state.authenticated
        ? 'Codex connected. Live inference has not been verified yet.'
        : 'Codex connected. Sign in to start working.';
      this.emit('status');
    } catch (e: any) {
      this.fail(e);
      this.child?.kill();
      throw e;
    }
  }
  async refreshAccount() {
    const account = await this.rpc('account/read', { refreshToken: false });
    this.state.authenticated = !!account.account;
    try {
      this.state.rateLimits = await this.rpc('account/rateLimits/read', {});
    } catch {}
    this.emit('status');
  }
  rpc(method: string, params: any = {}, timeout = 60000): Promise<any> {
    if (!this.child || !this.child.stdin.writable)
      return Promise.reject(new Error('Codex is not connected.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  send(message: any) {
    this.child?.stdin.write(JSON.stringify(message) + '\n');
  }
  respond(id: number, result: any) {
    this.send({ id, result });
  }
  private fail(error: Error) {
    this.state.state = 'error';
    this.state.verified = false;
    this.state.message = error.message;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.emit('status');
    this.emit('disconnect', error.message);
  }
  close() {
    this.stopping = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Service stopped.'));
    }
    this.pending.clear();
    this.child?.kill();
    this.child = undefined;
    this.state.state = 'disconnected';
  }
}
