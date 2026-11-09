import { execFileSync } from 'node:child_process';
import { findCodex } from '../server/codex.js';
execFileSync(
  findCodex(),
  ['app-server', 'generate-ts', '--experimental', '--out', 'generated/codex'],
  { stdio: 'inherit', windowsHide: true },
);
