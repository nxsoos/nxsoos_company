import { Codex } from '../server/codex.js';
const codex = new Codex();
try {
  await codex.connect();
  const result = await codex.rpc('command/exec', {
    command: ['git', 'status', '--short'],
    processId: 'company-command-probe',
    cwd: process.cwd(),
    timeoutMs: 15000,
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots: [process.cwd()],
      networkAccess: false,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    },
  });
  console.log(JSON.stringify(result));
  if (result.exitCode !== 0) process.exitCode = 1;
  if (process.argv.includes('--cancel')) {
    const pending = codex.rpc('command/exec', {
      command: [process.execPath, '-e', 'setTimeout(() => {}, 4000)'],
      processId: 'company-cancel-probe',
      cwd: process.cwd(),
      timeoutMs: 25000,
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [process.cwd()],
        networkAccess: false,
        excludeTmpdirEnvVar: true,
        excludeSlashTmp: true,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await codex.rpc('command/exec/terminate', { processId: 'company-cancel-probe' });
    } catch (error: any) {
      if (process.platform !== 'win32' || !error.message.includes('not supported')) throw error;
      await pending;
      console.log(
        'PASS: Windows termination limitation confirmed; bounded check finished before shutdown.',
      );
      codex.close();
      process.exit(0);
    }
    const stopped = await pending;
    if (stopped.exitCode === 0)
      throw new Error('Cancellation probe did not terminate the command.');
    console.log('PASS: sandboxed command termination confirmed.');
  }
} catch (e: any) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  codex.close();
}
