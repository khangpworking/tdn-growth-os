import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOperatorApp, operatorAppConfigurationFromEnvironment, type OperatorAppApplication } from '../src/api/operator-app.js';

export async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const configuration = operatorAppConfigurationFromEnvironment(process.env, { frontendDist: path.join(root, 'frontend', 'dist'), version });
  let application: OperatorAppApplication | undefined;
  try {
    application = openOperatorApp(configuration);
    application.server.listen(configuration.port, configuration.host);
    await once(application.server, 'listening');
    process.stdout.write(`Operator app listening on ${application.origin}; OWNER writes ${configuration.ownerWritesEnabled ? 'enabled' : 'disabled'}\n`);
  } catch (error) {
    if (application) await application.close().catch(() => undefined);
    throw error;
  }

  let shutdown: Promise<void> | undefined;
  const close = (): Promise<void> => {
    shutdown ??= application!.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
    return shutdown;
  };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
}

function reportStartupFailure(): void {
  process.stderr.write('Operator app failed to start. Check configuration, database, artifacts, frontend build, and port availability.\n');
  process.exitCode = 1;
}

void main().catch(reportStartupFailure);
