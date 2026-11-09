import { Codex } from '../server/codex.js';
const codex = new Codex();
try {
  await codex.connect();
  console.log(
    JSON.stringify(
      {
        version: codex.state.version,
        authenticated: codex.state.authenticated,
        models: codex.state.models.map((x) => x.id),
      },
      null,
      2,
    ),
  );
  const t = await codex.rpc('thread/start', {
    cwd: process.cwd(),
    sandbox: 'read-only',
    approvalPolicy: 'never',
    ephemeral: true,
    baseInstructions:
      'You are a connection test. You must call company_ping before answering. Do not read or write any files.',
    dynamicTools: [
      {
        type: 'function',
        name: 'company_ping',
        description: 'Verify that the host application can receive dynamic tool calls.',
        deferLoading: false,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
  });
  console.log('Dynamic tool thread accepted:', t.thread.id);
  if (process.argv.includes('--live')) {
    if (!codex.state.authenticated) throw new Error('Sign in to Codex before the live probe.');
    let called = false;
    codex.on('request', (m) => {
      console.log('Server request:', m.method);
      if (m.method === 'item/tool/call') {
        called = true;
        codex.respond(m.id, { contentItems: [{ type: 'inputText', text: 'pong' }], success: true });
      } else codex.respond(m.id, { decision: 'decline' });
    });
    codex.on('notification', (method, p) => {
      if (method === 'item/completed')
        console.log(
          'Probe item:',
          p.item?.type,
          p.item?.tool || p.item?.text || p.item?.summary || '',
        );
    });
    await new Promise<void>(async (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Live probe timed out.')), 90000);
      codex.on('notification', (method, p) => {
        if (method === 'turn/completed' && p.threadId === t.thread.id) {
          clearTimeout(timer);
          if (p.turn.status === 'completed' && called) resolve();
          else
            reject(
              new Error(
                'Live turn or dynamic tool test did not complete: ' +
                  JSON.stringify({
                    status: p.turn.status,
                    error: p.turn.error,
                    toolCalled: called,
                  }),
              ),
            );
        }
      });
      try {
        await codex.rpc('turn/start', {
          threadId: t.thread.id,
          input: [
            {
              type: 'text',
              text: 'Call company_ping exactly once, then reply with CONNECTED. Do not use any other tools.',
            },
          ],
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
    console.log('LIVE PASS: inference and dynamic tool round trip completed.');
  }
} catch (e: any) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  codex.close();
}
