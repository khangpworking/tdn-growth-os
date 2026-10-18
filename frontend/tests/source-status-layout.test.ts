import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/research-automation/source-status.css', import.meta.url), 'utf8');

test('SerpApi operation rows span the whole definition grid instead of the 0-width first column', () => {
  const rule = css.split('\n').find(line => line.startsWith('.ra-source .ra-source-operation{'));
  assert.ok(rule, 'operation row rule exists');
  assert.ok(rule.includes('grid-column:1/-1'));
  assert.ok(rule.includes('grid-template-columns:subgrid'));
});

test('source card stacks label above value on phones', () => {
  const mobile = css.slice(css.lastIndexOf('@media(max-width:650px){.ra-source dl'));
  assert.ok(mobile.includes('.ra-source dl{grid-template-columns:minmax(0,1fr)'));
});
