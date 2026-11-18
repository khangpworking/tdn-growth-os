import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { lazyValidator } from '../../src/platform/lazy-validator.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');

const schema = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
  additionalProperties: false,
};

test('lazyValidator answers like the eager validator and compiles once', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const eager = ajv.compile(schema);
  let compiles = 0;
  // A distinct schema object, so Ajv's per-object cache cannot hand back the eager validator.
  const lazy = lazyValidator(() => { compiles++; return ajv.compile({ ...schema }); });
  const valid = { name: 'ok' }, invalid = { name: 3 };

  assert.equal(lazy(valid), eager(valid));
  assert.equal(lazy.errors, eager.errors);
  assert.equal(lazy(invalid), eager(invalid));
  assert.deepEqual(lazy.errors, eager.errors);
  assert.equal(lazy(valid), true);
  assert.equal(lazy.errors, null);
  assert.equal(compiles, 1);
});

test('lazyValidator uses a registered id instead of compiling it again', () => {
  const ajv = new Ajv2020({ strict: true });
  const registeredSchema = { $id: 'https://tdn.local/test/lazy-registered.schema.json', type: 'string' };
  ajv.addSchema(registeredSchema);
  const eager = ajv.getSchema(registeredSchema.$id)!;
  let compiles = 0;
  const spy = {
    getSchema: (id: string) => ajv.getSchema(id),
    compile: <T = unknown>(value: unknown) => { compiles++; return ajv.compile<T>(value as never); },
  };
  const lazy = lazyValidator(spy, registeredSchema);
  assert.equal(lazy('value'), eager('value'));
  assert.equal(compiles, 0);
});

test('lazyValidator throws the same compile error on every call', () => {
  const failure = new Error('compile failed');
  const lazy = lazyValidator(() => { throw failure; });
  assert.throws(() => lazy({}), (error) => error === failure);
  assert.throws(() => lazy({}), (error) => error === failure);
});

test('compileAll compiles every schema registered in the read-view import graph', () => {
  // A fresh process: this file's own registry already holds a deliberately failing compile above.
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', [
    "const { compileAll } = await import('./src/platform/lazy-validator.ts');",
    "await import('./scripts/module-run-view.ts');",
    "await import('./scripts/module-review-sampling.ts');",
    "await import('./scripts/module-review-data.ts');",
    'compileAll();',
  ].join(' ')], { cwd: root, stdio: 'pipe' });
});
