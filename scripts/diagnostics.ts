import { join } from 'node:path';
import { Codex } from '../server/codex.js';
import { defaultDirectory, readJson, atomicJson } from '../server/local.js';
import { integrationStatus, type IntegrationManifest } from '../server/integration.js';
const directory = defaultDirectory();
const manifest = readJson<IntegrationManifest>(join(directory, 'integration.json'));
const codex = new Codex({ nativeHooks: true });
try {
  if (!manifest?.installed) throw new Error('Run npm run codex:link first.');
  await codex.connect();
  const result = await codex.rpc('hooks/list', { cwds: [process.cwd()] });
  const ownedCommands = new Set(
    Object.values(manifest.hookGroups).flatMap((group: any) =>
      (group.hooks || []).map((hook: any) => hook.command),
    ),
  );
  const hooks = (result.data || [])
    .flatMap((entry: any) => entry.hooks || [])
    .filter((hook: any) => ownedCommands.has(hook.command));
  const check = {
    checkedAt: new Date().toISOString(),
    hooks: hooks.map((h: any) => ({
      event: h.eventName,
      enabled: h.enabled,
      trust: h.trustStatus,
    })),
    errors: (result.data || []).flatMap((entry: any) => entry.errors || []),
  };
  atomicJson(join(directory, 'integration-diagnostics.json'), check);
  console.log(JSON.stringify({ ...integrationStatus(directory), hookReview: check }, null, 2));
  if (
    !hooks.length ||
    hooks.some((h: any) => !h.enabled || !['trusted', 'managed'].includes(h.trustStatus))
  )
    console.log(
      'ACTION: Open Codex /hooks and review/trust the Nxsoos entries. No trust settings were changed by this check.',
    );
  console.log(
    'No inference was requested. This diagnostic checks hook configuration; live capture verification is reported separately above.',
  );
} catch (error: any) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  codex.close();
}
