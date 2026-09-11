import { createOwnerApiServer } from '../src/api/owner-api.js';

const enabled = process.env.TDN_OWNER_API_ENABLED;
if (enabled !== 'true') throw new Error('TDN_OWNER_API_ENABLED must be exactly true (OWNER writes are opt-in)');
const databasePath = process.env.TDN_WORKSPACE_DB;
const artifactRoot = process.env.TDN_ARTIFACT_ROOT;
const token = process.env.TDN_OWNER_API_TOKEN;
const allowedOrigin = process.env.TDN_OWNER_API_ALLOWED_ORIGIN;
const actorId = process.env.TDN_OWNER_API_ACTOR_ID;
const host = process.env.TDN_OWNER_API_HOST ?? '127.0.0.1';
const port = Number(process.env.TDN_OWNER_API_PORT ?? '8081');
if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') throw new Error('TDN_OWNER_API_HOST must be a loopback host');
if (!databasePath || !artifactRoot || !token || !allowedOrigin || !actorId) throw new Error('TDN_WORKSPACE_DB, TDN_ARTIFACT_ROOT, TDN_OWNER_API_TOKEN, TDN_OWNER_API_ALLOWED_ORIGIN, and TDN_OWNER_API_ACTOR_ID are required');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('TDN_OWNER_API_PORT must be an integer from 1 to 65535');
const application = createOwnerApiServer({ databasePath, artifactRoot, token, allowedOrigin, actorId });
application.server.listen(port, host, () => process.stdout.write(`OWNER API listening on http://${host}:${port}\n`));
let closing = false;
const close = (): void => { if (closing) return; closing = true; void application.close().then(() => process.exit(0), () => process.exit(1)); };
process.on('SIGINT', close); process.on('SIGTERM', close);
