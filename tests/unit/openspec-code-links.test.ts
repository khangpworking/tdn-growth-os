import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

// OpenSpec finish-move step 5 (openspec/MIGRATION.md §4): every file and name written on a
// "Mã kiểm" line of openspec/specs must exist in the code. Only openspec/specs is read, so
// openspec/changes and openspec/reference are skipped.

const root = process.cwd();
const specsDir = join(root, 'openspec', 'specs');

// Pre-existing references that do not resolve. Each entry is "<spec file> | <reference>".
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  // `contractVersion` is an input field read by projectMarketUnitPrices, not a declaration.
  // `research-automation/` is the wrong directory business-spec used, quoted in a note; not a code link.
  ['openspec/specs/market-report/spec.md | research-automation/', 'historical note, not a path; pre-existing, reported to owner 24/10/2026'],
  ['openspec/specs/market-report/spec.md | contractVersion', 'field name, not a declaration; pre-existing, reported to owner 24/10/2026'],
]);

type LinkProblem = { readonly spec: string; readonly line: number; readonly reference: string; readonly reason: string };
type Reference = { readonly kind: 'file' | 'symbol' | 'gate'; readonly value: string };

const LABEL = /^\s*(?:-\s*)?Mã kiểm\b/u;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const GATE_CODE = /^[A-Z][A-Z0-9_]*$/u;

function walk(dir: string, accept: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, accept);
    return accept(path) ? [path] : [];
  });
}

// Backticked tokens on one "Mã kiểm" line. A path is a token with "/"; a trailing ":<line>"
// is dropped. A gate code is an upper-case token in a list right after "Cổng"/"cổng". Other
// identifiers are symbols. Anything else (for example `MARKET_14_RULES_FAILED:<n>`) is ignored.
function parseCodeLine(text: string): Reference[] {
  const references: Reference[] = [];
  for (const match of text.matchAll(/`([^`]+)`/gu)) {
    const token = match[1]!.trim();
    const before = text.slice(0, match.index);
    const gateList = /cổng((?:\s*`[A-Z0-9_]+`\s*,)*)\s*$/iu.test(before);
    if (token.includes('/')) references.push({ kind: 'file', value: token.replace(/:\d+(?::\d+)?$/u, '') });
    else if (gateList && GATE_CODE.test(token)) references.push({ kind: 'gate', value: token });
    else if (IDENTIFIER.test(token)) references.push({ kind: 'symbol', value: token });
  }
  return references;
}

function declares(source: string, name: string): boolean {
  const escaped = name.replace(/[$]/gu, '\\$');
  return new RegExp(`\\b(?:function\\*?|const|let|var|class|type|interface|enum)\\s+${escaped}\\b`, 'u').test(source)
    || new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`, 'u').test(source);
}

function checkSpec(spec: string, text: string, readFile: (path: string) => string | undefined, allSources: () => readonly string[]): LinkProblem[] {
  const problems: LinkProblem[] = [];
  text.split('\n').forEach((lineText, index) => {
    if (!LABEL.test(lineText)) return;
    const line = index + 1;
    const references = parseCodeLine(lineText);
    const files: string[] = [];
    for (const ref of references.filter((r) => r.kind === 'file')) {
      const source = readFile(ref.value);
      if (source === undefined) problems.push({ spec, line, reference: ref.value, reason: 'file not found' });
      else files.push(source);
    }
    for (const ref of references.filter((r) => r.kind === 'symbol')) {
      const scope = files.length > 0 ? files : allSources();
      if (!scope.some((source) => declares(source, ref.value))) {
        problems.push({ spec, line, reference: ref.value, reason: files.length > 0 ? 'not declared in the files on this line' : 'not declared anywhere in src' });
      }
    }
    for (const ref of references.filter((r) => r.kind === 'gate')) {
      const literal = new RegExp(`['"\`]${ref.value}['"\`]`, 'u');
      if (!allSources().some((source) => literal.test(source))) problems.push({ spec, line, reference: ref.value, reason: 'gate code not found as a string literal in src' });
    }
  });
  return problems;
}

function repoReader(path: string): string | undefined {
  const full = join(root, path);
  return existsSync(full) && statSync(full).isFile() ? readFileSync(full, 'utf8') : undefined;
}

let srcCache: string[] | undefined;
function repoSources(): readonly string[] {
  srcCache ??= walk(join(root, 'src'), (path) => path.endsWith('.ts')).map((path) => readFileSync(path, 'utf8'));
  return srcCache;
}

test('every file, symbol and gate code on a "Mã kiểm" line of openspec/specs exists in the code', () => {
  const specs = walk(specsDir, (path) => path.endsWith('/spec.md'));
  assert.ok(specs.length > 0, 'no openspec/specs/**/spec.md found');
  let referenceCount = 0;
  const problems: LinkProblem[] = [];
  for (const path of specs) {
    const spec = relative(root, path).split('\\').join('/');
    const text = readFileSync(path, 'utf8');
    referenceCount += text.split('\n').filter((l) => LABEL.test(l)).flatMap(parseCodeLine).length;
    problems.push(...checkSpec(spec, text, repoReader, repoSources));
  }
  assert.ok(referenceCount > 0, 'no references parsed; the "Mã kiểm" label format may have changed');
  const unexpected = problems.filter((p) => !ALLOWLIST.has(`${p.spec} | ${p.reference}`));
  assert.deepEqual(unexpected.map((p) => `${p.spec}:${p.line} \`${p.reference}\` ${p.reason}`), []);
  const stale = [...ALLOWLIST.keys()].filter((key) => !problems.some((p) => `${p.spec} | ${p.reference}` === key));
  assert.deepEqual(stale, [], 'allowlist entries that now resolve; remove them');
});

test('negative control: a missing file, an undeclared symbol and an unknown gate code are reported', () => {
  const files: Record<string, string> = { 'src/a.ts': 'export function realFn() {}\nconst REAL = 1;\nfail(\'REAL_GATE\');\n' };
  const spec = [
    '- Mã kiểm: `src/a.ts`: `realFn`, `REAL`, `ghostFn`',
    '- Mã kiểm: `src/missing.ts:12`',
    '- Mã kiểm: Cổng `REAL_GATE`, `GHOST_GATE`: `realFn` (xem R-X01)',
    '- Vì sao: `src/ignored.ts` is not on a "Mã kiểm" line',
  ].join('\n');
  const problems = checkSpec('fake/spec.md', spec, (p) => files[p], () => Object.values(files));
  assert.deepEqual(problems.map((p) => `${p.line} ${p.reference}`), ['1 ghostFn', '2 src/missing.ts', '3 GHOST_GATE']);
});
