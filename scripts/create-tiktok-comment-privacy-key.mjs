// Creates the S07 TikTok comment privacy key file named by TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE:
// { "keyId": <random uuid v4>, "salt": <32 random bytes, base64> }, mode 600. Refuses to overwrite an existing file.
// Never prints the key id or the salt. Usage: node scripts/create-tiktok-comment-privacy-key.mjs <absolute path>
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file || process.argv.length !== 3 || !path.isAbsolute(file)) {
  console.error('usage: node scripts/create-tiktok-comment-privacy-key.mjs <absolute path>');
  process.exit(2);
}
let fd;
try { fd = fs.openSync(file, 'wx', 0o600); }
catch (error) {
  console.error(error?.code === 'EEXIST' ? 'refused: the file already exists' : 'refused: the file cannot be created');
  process.exit(1);
}
try {
  fs.fchmodSync(fd, 0o600);
  fs.writeFileSync(fd, JSON.stringify({ keyId: randomUUID(), salt: randomBytes(32).toString('base64') }) + '\n');
  fs.fsyncSync(fd);
} finally { fs.closeSync(fd); }
console.log('created the privacy key file (mode 600)');
