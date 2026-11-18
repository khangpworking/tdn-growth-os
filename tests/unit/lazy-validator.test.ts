import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

/** A fresh process per row, so lazy mode from one row cannot leak into another. */
function runModule(source: string): string {
  return execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: root, stdio: 'pipe', encoding: 'utf8',
  });
}

test('without lazy mode a validator compiles at creation', () => {
  const output = runModule([
    "import assert from 'node:assert/strict';",
    "const { lazyValidator } = await import('./src/platform/lazy-validator.ts');",
    'let compiles = 0;',
    "const validate = lazyValidator(() => { compiles++; return (value) => typeof value === 'string'; });",
    "assert.equal(compiles, 1, 'compiled at creation');",
    "assert.equal(validate('x'), true);",
    "assert.equal(compiles, 1, 'not compiled again on call');",
    "console.log('ok');",
  ].join('\n'));
  assert.equal(output.trim(), 'ok');
});

test('without lazy mode a bad schema throws at import (creation)', () => {
  assert.throws(() => runModule([
    "const { lazyValidator } = await import('./src/platform/lazy-validator.ts');",
    "lazyValidator(() => { throw new Error('bad schema'); });",
    "console.log('unreachable');",
  ].join('\n')));
});

test('with lazy mode a validator compiles on first call', () => {
  const output = runModule([
    "import assert from 'node:assert/strict';",
    "const { enableLazyValidators, lazyValidator } = await import('./src/platform/lazy-validator.ts');",
    'enableLazyValidators();',
    'let compiles = 0;',
    "const validate = lazyValidator(() => { compiles++; return (value) => typeof value === 'string'; });",
    "assert.equal(compiles, 0, 'not compiled at creation');",
    "assert.equal(validate('x'), true);",
    "assert.equal(compiles, 1, 'compiled on first call');",
    "console.log('ok');",
  ].join('\n'));
  assert.equal(output.trim(), 'ok');
});

test('with lazy mode a bad schema throws the same error on first use', () => {
  const output = runModule([
    "import assert from 'node:assert/strict';",
    "const { enableLazyValidators, lazyValidator } = await import('./src/platform/lazy-validator.ts');",
    'enableLazyValidators();',
    "const failure = new Error('bad schema');",
    'const validate = lazyValidator(() => { throw failure; });',
    'assert.throws(() => validate({}), (error) => error === failure);',
    'assert.throws(() => validate({}), (error) => error === failure);',
    "console.log('ok');",
  ].join('\n'));
  assert.equal(output.trim(), 'ok');
});

test('each read-view entry imports the lazy-mode module first', () => {
  for (const file of ['scripts/module-run-view.ts', 'scripts/module-review-sampling.ts', 'scripts/module-review-data.ts']) {
    const firstImport = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
      .split('\n').find(line => /^\s*import\s/.test(line));
    assert.equal(firstImport?.trim(), "import './lazy-validators-on.js';", `${file} must import the lazy-mode module first`);
  }
});

/** Lazy mode as seen by a validator created after the lazy-mode module ran, with `entry` as the started path. */
function lazyFor(entry: string): boolean {
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', [
    "await import('./scripts/lazy-validators-on.ts');",
    "const { lazyValidator } = await import('./src/platform/lazy-validator.ts');",
    'let compiles = 0;',
    'lazyValidator(() => { compiles++; return () => true; });',
    "console.log(compiles === 0 ? 'lazy' : 'eager');",
  ].join('\n'), entry], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  return output.trim() === 'lazy';
}

test('lazy mode is on only for the exact read-view entry files', () => {
  for (const name of ['module-run-view.ts', 'module-review-sampling.ts', 'module-review-data.ts']) {
    assert.equal(lazyFor(`${root}scripts/${name}`), true, `${name} in scripts/ is a read-view entry`);
    assert.equal(lazyFor(`${root}other/${name}`), false, `a same-named ${name} in another folder stays eager`);
  }
  assert.equal(lazyFor(`${root}scripts/module-pick.ts`), false, 'any other entry stays eager');
});

test('compileAll compiles every schema registered in the read-view import graph', () => {
  runModule([
    "const { compileAll, enableLazyValidators } = await import('./src/platform/lazy-validator.ts');",
    'enableLazyValidators();',
    "await import('./scripts/module-run-view.ts');",
    "await import('./scripts/module-review-sampling.ts');",
    "await import('./scripts/module-review-data.ts');",
    'compileAll();',
  ].join('\n'));
});
