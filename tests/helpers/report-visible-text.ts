import { JSDOM } from 'jsdom';
import { containsTechnicalId } from '../../src/modules/analysis/citation-registry.js';
import { findHiddenNames } from '../../src/modules/analysis/report-language/index.js';

/**
 * P1-11: the text a reader actually reads. Style, script and every disclosure are
 * removed before the tags are stripped, so a code or digest hidden in
 * "Hồ sơ đối chiếu" cannot pass the reader-text checks by accident. A caller that
 * already parsed the report passes the document; its clone is read, never mutated.
 */
export function reportVisibleText(source: string | Document): string {
  const document = typeof source === 'string' ? new JSDOM(source).window.document : source.cloneNode(true) as Document;
  for (const node of document.querySelectorAll('style, script, details')) node.remove();
  return (document.body.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

/** Full-report leak check, including attributes, disclosures and scripts. */
export function reportContainsToken(source: string | Document, token: string): boolean {
  const html = typeof source === 'string' ? source : source.documentElement.outerHTML;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9+/=_-])${escaped}(?![A-Za-z0-9+/=_-])`, 'u').test(html);
}

/** Source status codes such as AUTOMATION_PARTIAL must not reach reader text. */
const SOURCE_CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

/** P1-12: provider names, 32+ hex runs and source codes found in reader text. */
export function visibleTextViolations(visibleText: string): string[] {
  const names = [...new Set(findHiddenNames(visibleText, 'CITATION').map(hit => hit.name.toLowerCase()))];
  const violations = names.map(name => `provider name "${name}"`);
  for (const code of visibleText.match(SOURCE_CODE) ?? []) violations.push(`source code "${code}"`);
  if (containsTechnicalId(visibleText)) violations.push('32+ hex run');
  return violations;
}

/**
 * P1-13: provider names are banned from the whole document, disclosures included.
 * Preformatted retained artifacts must also use a safe reader projection.
 */
export function providerNameViolations(html: string): string[] {
  const document = new JSDOM(html).window.document;
  const walker = document.createTreeWalker(document, 4);
  const nodes: string[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode.textContent ?? '');
  const text = nodes.join(' ') + ' ' + [...document.querySelectorAll('*')]
    .flatMap(node => [...node.attributes].map(attribute => attribute.value)).join(' ');
  const violations = [...new Set(findHiddenNames(text, 'READER').map(hit => hit.name.toLowerCase()))];
  document.defaultView?.close();
  return violations;
}

/** P1-09: one register at the end of the report, listing exactly the numbers the page cites. */
export function citationRegisterViolations(document: Document): string[] {
  const registers = [...document.querySelectorAll('.citation-register')];
  const cited = [...new Set([...document.querySelectorAll('.cite')].map(mark => mark.textContent!.replace(/\D/g, '')))].sort();
  const listed = registers.flatMap(register => [...register.querySelectorAll('li')].map(item => item.id.replace('cite-', ''))).sort();
  const violations = cited.length === listed.length && cited.every((number, index) => number === listed[index])
    ? [] : [`marks [${cited}] do not match register [${listed}]`];
  if (registers.length > 1) violations.push(`${registers.length} citation registers`);
  else if (listed.length > 0 && registers[0]!.previousElementSibling?.id !== 'sections') violations.push('register does not follow the sections');
  return violations;
}
