import { collectionWebRows } from '../research-automation/expanded-search-lane.js';
import type { AutomationReportInput } from '../research-automation/reports.js';
import { admitWebResults, checkSourceEvidence, type AutomationSourceEvidence } from '../research-automation/source-evidence.js';
import { classifyWebPage, WEB_PAGE_TYPE_LABEL } from '../research-automation/web-page-type.js';
import { ReaderReportInputError } from './build.js';
import { storedLiteral, type ReportCitations } from '../research-automation/descriptive-report.js';
import { CAPTURED_PROVIDER_NAMES } from './lint.js';

const esc = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const PROVIDER_WORDS = new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...CAPTURED_PROVIDER_NAMES, 'Google'].map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
const unsafe = (text: string): boolean => { let t = text; try { t = decodeURIComponent(text); } catch { /* keep raw */ } return PROVIDER_WORDS.test(text) || PROVIDER_WORDS.test(t); };
/** storedLiteral withholds provider names and technical codes; the extra check also withholds search-engine and lane names. */
const shown = (text: string, withheld: string): string => unsafe(text) || storedLiteral(text, withheld) !== esc(text) ? esc(withheld) : esc(text);
const domainOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; } };

/** Context pointers only: the same run's L9-admitted search rows, in stored order, never counted, ranked or coded.
 * Returns null (nothing is appended) for stored packets without the page-type marker and for runs with no admitted row. */
export function insightWebContextSection(methods: Pick<AutomationReportInput, 'collection' | 'captures' | 'sourceEvidence'>, citations: ReportCitations): string | null {
  const packet: AutomationSourceEvidence | undefined = methods.sourceEvidence;
  if (!packet || packet.webPageTypes !== true || !methods.collection || !methods.captures) return null;
  checkSourceEvidence(packet);
  const seen = new Set<string>(), rows = admitWebResults(packet, collectionWebRows(methods.collection), methods.captures, packet.jevTriage ?? null)
    .filter(row => /^https:\/\//i.test(row.url) && !seen.has(row.url) && !!seen.add(row.url));
  if (rows.length === 0) return null;
  // Registered use must match what is drawn: a registry row per rendered type, each (id, binding) once.
  const used = new Set<string>();
  for (const row of packet.sourceAppendix.rows) {
    const key = `${row.registryId}|${row.binding.kind}|${row.binding.ref}`;
    if (used.has(key)) throw new ReaderReportInputError('Insight web context source usage is duplicated.');
    used.add(key);
    if (row.l10SourceType !== null && row.registryId !== 'S07') throw new ReaderReportInputError('Insight web context source usage has a comment type outside S07.');
  }
  // The exact (registryId, capture) pair of each drawn row, not the registry id alone.
  const registered = (id: string, captureSha: string): boolean => packet.sourceAppendix.rows.some(row => row.registryId === id && row.binding.kind === 'capture' && row.binding.ref === captureSha);
  const body = rows.map(row => {
    const type = classifyWebPage(row), label = WEB_PAGE_TYPE_LABEL[type];
    const cap = methods.captures!.find(c => c.stepId === 'COLLECTION' && c.ordinal === row.captureIndex);
    if (!cap || !registered(type, cap.artifactSha256)) throw new ReaderReportInputError('Insight web context row lacks its registered source usage.');
    // Same masking as Market: a provider name or "Google" in a copied title, domain or address never reaches the reader.
    const mark = unsafe(row.url) ? '' : citations.mark({ sourceKind: 'WEB_RESULT', identity: row.url, locator: null, label: 'Trang web liên quan', retrievedAt: row.retrievedAt, url: row.url, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return `<tr><td><span data-quote>${shown(row.title, 'Tiêu đề được giữ trong hồ sơ nguồn')}</span>${mark}</td><td>${label}</td><td><span data-quote>${shown(domainOf(row.url), 'Trang được giữ trong hồ sơ nguồn')}</span></td><td><a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">Mở trang gốc</a></td></tr>`;
  }).join('');
  return `<div class="web-context" id="insight-web-context"><h3>Trang web liên quan</h3><p>Các trang dưới đây chỉ là ngữ cảnh để mở trang gốc đối chiếu, theo thứ tự đã lưu. Không phải lời khách hàng; không dùng trong mã hóa, tần suất, chân dung hay trích dẫn.</p><div class="table-wrap" role="region" aria-label="Trang web liên quan" tabindex="0"><table><caption>Trang web liên quan, tách khỏi lời khách hàng</caption><thead><tr><th>Tiêu đề</th><th>Loại trang</th><th>Trang</th><th>Liên kết</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}
