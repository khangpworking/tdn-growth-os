import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetainedSchemaCache } from '../../src/modules/analysis/research-automation/retained-schema-cache.js';

const id = 'https://synthetic.local/retained.schema.json';
const profile = (schema: object, path = 'profiles/synthetic.json') => ({ path,
  id: (schema as { $id: string }).$id, bytes: Buffer.from(JSON.stringify(schema)) });
const strings = { $id: id, type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false };

test('warm compiled schemas still reject every invalid output and expose no mutable AJV state', () => {
  const compile = createRetainedSchemaCache({ formats: false });
  const cold = compile([profile(strings)]), warm = compile([profile(strings)]);
  assert.equal(cold, warm);
  assert.ok(Object.isFrozen(warm));
  assert.equal(Object.hasOwn(warm[id]!, 'errors'), false);
  assert.equal(Object.hasOwn(warm[id]!, 'schema'), false);
  for (const validators of [cold, warm, createRetainedSchemaCache({ formats: false })([profile(strings)])]) {
    assert.equal(validators[id]!({ value: 'retained source' }), true);
    assert.equal(validators[id]!({ value: 12 }), false);
    assert.equal(validators[id]!({ value: 'retained source', approval: true }), false);
    assert.equal(validators[id]!({}), false);
    assert.equal(validators[id]!({ value: 'restored source' }), true);
  }
  assert.throws(() => { (warm as Record<string, unknown>)[id] = () => true; }, TypeError);
});

test('the same schema ID with changed bytes never reuses an earlier meaning', () => {
  const compile = createRetainedSchemaCache({ formats: false });
  const original = profile(strings), cold = compile([original]);
  original.bytes.fill(0);
  assert.equal(cold[id]!({ value: 'original' }), true, 'caller byte mutation cannot change an already compiled schema');
  assert.throws(() => compile([original]), SyntaxError);
  const numbers = { ...strings, properties: { value: { type: 'number' } } };
  const changed = compile([profile(numbers)]);
  assert.notEqual(changed, cold);
  assert.equal(changed[id]!({ value: 'original' }), false);
  assert.equal(changed[id]!({ value: 12 }), true);
  const restored = compile([profile(strings)]);
  assert.equal(restored[id]!({ value: 'original' }), true);
  assert.equal(restored[id]!({ value: 12 }), false);
});

test('ordered profiles include every referenced dependency and its exact bytes', () => {
  const compile = createRetainedSchemaCache({ formats: false });
  const dependencyId = 'https://synthetic.local/dependency.schema.json';
  const root = profile({ $id: id, type: 'object', properties: { value: { $ref: dependencyId } }, required: ['value'] });
  const dependency = profile({ $id: dependencyId, type: 'string' }, 'profiles/dependency.json');
  const cold = compile([root, dependency]);
  assert.equal(cold[id]!({ value: 'original' }), true);
  const reordered = compile([dependency, root]);
  assert.notEqual(reordered, cold);
  assert.equal(reordered[id]!({ value: 'original' }), true);
  const changed = compile([root, profile({ $id: dependencyId, type: 'number' }, dependency.path)]);
  assert.equal(changed[id]!({ value: 'original' }), false);
  assert.equal(changed[id]!({ value: 12 }), true);
  assert.throws(() => compile([root]), /reference/);
  assert.throws(() => compile([{ ...dependency, id }]), /identity differs/);
});

test('compiler policies stay separate and immutable: Metric formats versus native no-formats', () => {
  const policy = { formats: true };
  const metric = createRetainedSchemaCache(policy);
  policy.formats = false;
  const native = createRetainedSchemaCache({ formats: false });
  const dated = profile({ $id: id, type: 'string', format: 'date' });
  assert.equal(metric([dated])[id]!('2026-10-09'), true);
  assert.equal(metric([dated])[id]!('2026-13-40'), false);
  assert.throws(() => native([dated]), /unknown format/);
  assert.equal(native([profile(strings)])[id]!({ value: 'source' }), true);
  assert.equal(metric([profile(strings)])[id]!({ value: 'source' }), true);
});

test('invalid compilation propagates every time and never replaces successful validators', () => {
  const compile = createRetainedSchemaCache({ formats: false });
  const valid = compile([profile(strings)]);
  const invalid = profile({ $id: id, type: 'object', unknownKeyword: true });
  assert.throws(() => compile([invalid]), /unknown keyword/);
  assert.throws(() => compile([invalid]), /unknown keyword/);
  assert.equal(compile([profile(strings)]), valid);
  assert.equal(valid[id]!({ value: 12 }), false);
  const malformed = Buffer.concat([Buffer.from(`{"$id":"${id}","description":"`), Buffer.from([0xff]), Buffer.from('"}')]);
  assert.throws(() => compile([{ path: 'profiles/synthetic.json', id, bytes: malformed }]), /encoded data/);
  assert.throws(() => compile([profile(strings), profile(strings)]), /already exists/);
});

test('one successful entry is retained per hook; eviction and profile path changes preserve validity', () => {
  const compile = createRetainedSchemaCache({ formats: false });
  const first = compile([profile(strings)]);
  const moved = compile([profile(strings, 'profiles/other.json')]);
  assert.notEqual(moved, first);
  const restored = compile([profile(strings)]);
  assert.notEqual(restored, first);
  for (const validators of [first, moved, restored]) {
    assert.equal(validators[id]!({ value: 'source' }), true);
    assert.equal(validators[id]!({ value: null }), false);
  }
});
