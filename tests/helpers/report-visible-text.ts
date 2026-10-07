import { JSDOM } from 'jsdom';
import { CITATION_FORBIDDEN_NAMES, containsTechnicalId } from '../../src/modules/analysis/citation-registry.js';

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

/** Source status codes such as AUTOMATION_PARTIAL must not reach reader text. */
const SOURCE_CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

/** P1-12: every character outside the disclosures is written by the renderer, so any provider name is a leak. */
const anyName = (text: string): string[] => {
  const lower = text.toLowerCase();
  return CITATION_FORBIDDEN_NAMES.filter(name => lower.includes(name));
};

/** P1-12: provider names, 32+ hex runs and source codes found in reader text. */
export function visibleTextViolations(visibleText: string): string[] {
  const violations = anyName(visibleText).map(name => `provider name "${name}"`);
  for (const code of visibleText.match(SOURCE_CODE) ?? []) violations.push(`source code "${code}"`);
  if (containsTechnicalId(visibleText)) violations.push('32+ hex run');
  return violations;
}

// A provider name counts where it stands as its own word, so a retained path
// (`metric/workbook.xlsx`), a status code or a contract key (`"metric"`) is not
// read as naming the provider.
const BEFORE_NAME = '[\\s(«"“>=]';
const AFTER_NAME = '[\\s.,;:!?)»"”<]';
const namedAsWord = (name: string): RegExp => new RegExp(`${BEFORE_NAME}${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:${AFTER_NAME}|$)`, 'i');

/**
 * P1-13: provider names are banned from the whole document, disclosures included.
 * The only exception is `<pre>`, which holds a retained machine artifact verbatim
 * (the bounded-method and quote-method dumps): its field names come from stored
 * contracts this package cannot rename and are never renderer copy.
 */
export function providerNameViolations(html: string): string[] {
  const withoutDumps = html.replace(/<pre[\s\S]*?<\/pre>/gi, ' ');
  return CITATION_FORBIDDEN_NAMES.filter(name => namedAsWord(name).test(withoutDumps));
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
