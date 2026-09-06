import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'contracts', 'tests', 'scripts'];
const files = [];
for (const relativeRoot of roots) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) continue;
  for (const entry of fs.readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path.join(entry.parentPath, entry.name));
  }
}

const result = spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    '--noEmit',
    '--strict',
    '--noUncheckedIndexedAccess',
    '--exactOptionalPropertyTypes',
    '--target', 'ES2023',
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    '--resolveJsonModule',
    '--allowJs', 'false',
    '--types', 'node',
    ...files,
  ],
  { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
