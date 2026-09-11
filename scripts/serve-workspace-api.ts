import { createWorkspaceApiServer } from '../src/api/index.js';

const databasePath = process.env.TDN_WORKSPACE_DB;
const artifactRoot = process.env.TDN_ARTIFACT_ROOT;
const host = process.env.TDN_WORKSPACE_API_HOST ?? '127.0.0.1';
const rawPort = process.env.TDN_WORKSPACE_API_PORT ?? '8080';
const port = Number(rawPort);
if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') throw new Error('TDN_WORKSPACE_API_HOST must be a loopback host');
if (!databasePath || !artifactRoot) throw new Error('TDN_WORKSPACE_DB and TDN_ARTIFACT_ROOT are required');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('TDN_WORKSPACE_API_PORT must be an integer from 1 to 65535');

const application = createWorkspaceApiServer({ databasePath, artifactRoot });
application.server.listen(port, host, () => process.stdout.write(`Workspace API listening on http://${host}:${port}\n`));
let closing = false;
const close = (): void => {
  if (closing) return;
  closing = true;
  void application.close().then(() => process.exit(0), () => process.exit(1));
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
