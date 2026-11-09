import { defaultDirectory } from '../server/local.js';
import { linkIntegration, unlinkIntegration, integrationStatus } from '../server/integration.js';
const action = process.argv[2] || 'status';
const directory = defaultDirectory();
try {
  if (action === 'link') {
    const result = linkIntegration(directory);
    console.log(
      `Linked Nxsoos Company to ${result.codexHome}\nHooks: ${result.hooksFile}\nBackups: ${directory}\\integration-backups\nReview and trust the new hooks in Codex using /hooks. Existing CLI/IDE sessions may need restart or resume. Hook trust is never bypassed.`,
    );
  } else if (action === 'unlink')
    console.log(JSON.stringify(unlinkIntegration(directory), null, 2));
  else console.log(JSON.stringify(integrationStatus(directory), null, 2));
} catch (error: any) {
  console.error(error.message);
  process.exitCode = 1;
}
