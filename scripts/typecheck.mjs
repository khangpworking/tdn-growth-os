import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

// tsc runs through Node with the file list in a temporary project file: Windows cannot spawn the
// `.bin/tsc` shell shim, and the file list is longer than the Windows command-line limit.
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-'));
const project = path.join(projectDir, 'tsconfig.json');
let result;
try {
  fs.writeFileSync(project, JSON.stringify({
    compilerOptions: {
      noEmit: true,
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      target: 'ES2023',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      resolveJsonModule: true,
      allowJs: false,
      types: ['node'],
      typeRoots: [path.join(root, 'node_modules/@types')],
    },
    files,
  }));

  result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', project],
    { cwd: root, stdio: 'inherit' },
  );
} finally {
  fs.rmSync(projectDir, { recursive: true, force: true });
}
if (result.error) console.error(`typecheck: ${result.error.message}`);
process.exit(result.status ?? 1);
