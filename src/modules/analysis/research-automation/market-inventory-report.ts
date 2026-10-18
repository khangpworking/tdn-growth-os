import type { AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import { escapeHtml as escape, readerPointer, sourceMemberLabel, storedLiteral, type ReportCitations } from './descriptive-report.js';
import { formatReaderCount, formatReaderValue, readerMeasureName, readerProductLabel, readerQuoteLabel } from './reader-plain-text.js';

type Observation = AutomationMarketMethodSnapshot['temporal']['input']['observations'][number];
type Quote = AutomationMarketMethodSnapshot['quotes']['input']['quotes'][number];
type Trace = (ref: { sourceSha256: string; fieldPointer: string }) => string;
type Window = { readonly start: string | null; readonly end: string | null };

export function marketInventorySection(snapshot: AutomationMarketMethodSnapshot, section: 'M03' | 'M08', citations: ReportCitations, productLabels?: ReadonlyMap<string, string>, readerPlainText = false): string {
  const trace: Trace = ref => {
    const pointer = readerPointer(ref.fieldPointer, readerPlainText);
    return citations.mark({
      sourceKind: 'CAPTURE', identity: ref.sourceSha256.trim() === '' ? null : ref.sourceSha256, locator: pointer.locator,
      label: 'Số liệu nguồn đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { fieldPointer: ref.fieldPointer },
    });
  };
  if (readerPlainText) return section === 'M03' ? readerPeriodSection(snapshot, trace, productLabels) : readerPriceSection(snapshot, trace, productLabels);
  if (section === 'M03') {
    const rows = snapshot.temporal.input.observations.map(row => `<tr><td>${row.subjectMemberKeys.map(key => escape(sourceMemberLabel(key, false))).join(', ')}</td><td>${escape(row.measure.literal)} / ${escape(row.measure.unit ?? row.measure.currency ?? 'Chưa rõ đơn vị')}</td><td>${escape(row.value.literal ?? 'Thiếu giá trị nguồn')}</td><td>${escape(row.requestedWindow.start ?? '?')} đến ${escape(row.requestedWindow.end ?? '?')}</td><td>${trace(row.source)}</td></tr>`).join('');
    return `<p class="warning">Đã giữ số liệu theo kỳ truy vấn cho các sản phẩm được chọn. Chưa xác minh đầy đủ định nghĩa phép đo, múi giờ, biên kỳ, tính cộng được và độ phủ. Không cộng thành tổng năm, tính tăng trưởng hay gọi đây là quy mô thị trường.</p><div class="table-wrap" role="region" aria-label="Quan sát theo kỳ" tabindex="0"><table><caption>Quan sát theo kỳ, chưa phải chuỗi thời gian đủ điều kiện tính</caption><thead><tr><th>Đối tượng nguồn</th><th>Phép đo nguồn</th><th>Giá trị nguồn</th><th>Kỳ truy vấn</th><th>Nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Không có số liệu theo kỳ dùng được.</td></tr>'}</tbody></table></div>`;
  }
  const rows = snapshot.quotes.input.quotes.map(quote => `<tr><td>${storedLiteral(quote.quoteId, 'Bản ghi được giữ trong bản lưu nguồn')}</td><td>${quote.price.value !== null ? escape(quote.price.value) : quote.price.range ? `${escape(quote.price.range.minimum)} đến ${escape(quote.price.range.maximum)}` : 'Không có giá đọc được'} ${escape(quote.price.currency ?? '')}</td><td>${escape(quote.price.state)}<br>Chưa xác nhận giá pack/variant hoặc điều kiện thanh toán</td><td>${trace(quote.source)}</td></tr>`).join('');
  return `<p class="warning">Giá do nguồn trả về chỉ là quan sát. Chưa biết variant, số lượng mỗi pack, khối lượng tịnh/ráo hay điều kiện giá. Không tính giá mỗi đơn vị, biên lợi nhuận hoặc so sánh như cùng loại hàng.</p><div class="table-wrap" role="region" aria-label="Giá quan sát và khoảng giá nguồn" tabindex="0"><table><caption>Giá quan sát và khoảng giá nguồn, chưa chuẩn hóa đơn vị</caption><thead><tr><th>Bản ghi nguồn</th><th>Giá / khoảng giá</th><th>Giới hạn</th><th>Nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Chưa có báo giá nguồn.</td></tr>'}</tbody></table></div>`;
}

/** Product numbering follows the frozen run scope, then any further key in first-seen order. */
function productNamer(snapshot: AutomationMarketMethodSnapshot, productLabels: ReadonlyMap<string, string> | undefined) {
  const ordinals = new Map<string, number>();
  for (const member of snapshot.temporal.input.frame?.members ?? []) if (!ordinals.has(member.memberKey)) ordinals.set(member.memberKey, ordinals.size + 1);
  const ordinal = (key: string): number => {
    if (!ordinals.has(key)) ordinals.set(key, ordinals.size + 1);
    return ordinals.get(key)!;
  };
  return {
    ordinal: (keys: readonly string[]): number => keys.length ? Math.min(...keys.map(ordinal)) : Number.MAX_SAFE_INTEGER,
    label: (keys: readonly string[]): string => keys.map(key => readerProductLabel(sourceMemberLabel(key, true), productLabels?.get(key), ordinal(key))).join(', '),
    keys: (): readonly string[] => [...ordinals.keys()],
  };
}

function readerDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function windowText(window: Window | null): string {
  const start = readerDate(window?.start), end = readerDate(window?.end);
  return start && end ? `${start} đến ${end}` : 'Kỳ đo được giữ trong bản lưu nguồn';
}

/** The detail capture's own query window; the run's whole period only when the capture kept none. */
function observationWindow(row: Observation): Window {
  const raw = row.rawQuery as Partial<Observation['rawQuery']> | undefined;
  return raw?.start && raw.end ? { start: raw.start, end: raw.end } : { start: row.requestedWindow?.start ?? null, end: row.requestedWindow?.end ?? null };
}

function nextDay(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : new Date(time + 86_400_000).toISOString().slice(0, 10);
}

function observedDecimal(row: Observation): string | null {
  const decimal = row.value?.decimal;
  if (typeof decimal === 'string' && decimal.trim() !== '') return decimal;
  return /^\s*\{\s*"[^"\\]+"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?)\s*\}\s*$/.exec(row.value?.literal ?? '')?.[1] ?? null;
}

const isZero = (decimal: string | null): boolean => decimal !== null && /^-?0(?:\.0+)?$/.test(decimal);
const capitalized = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
const marks = (refs: readonly { sourceSha256: string; fieldPointer: string }[], trace: Trace): string => [...new Set(refs.map(trace))].join('');

/** M03 reader view: one row per product and query window, one column per measure. */
function readerPeriodSection(snapshot: AutomationMarketMethodSnapshot, trace: Trace, productLabels: ReadonlyMap<string, string> | undefined): string {
  const names = productNamer(snapshot, productLabels);
  const measures: string[] = [];
  const vnd = new Set<string>();
  type Row = { keys: readonly string[]; window: Window; first: number; cells: Map<string, Observation[]>; observations: Observation[]; periods: number };
  const groups = new Map<string, Row>();
  snapshot.temporal.input.observations.forEach((observation, index) => {
    const keys = observation.subjectMemberKeys ?? [];
    const window = observationWindow(observation);
    const measure = observation.measure?.literal ?? '';
    if (!measures.includes(measure)) measures.push(measure);
    if (observation.measure?.currency === 'VND' || observation.measure?.unit === 'VND') vnd.add(measure);
    const id = JSON.stringify([keys, window.start, window.end]);
    const row: Row = groups.get(id) ?? { keys, window, first: index, cells: new Map(), observations: [], periods: 1 };
    row.cells.set(measure, [...(row.cells.get(measure) ?? []), observation]);
    row.observations.push(observation);
    groups.set(id, row);
  });
  const ordered = [...groups.values()].sort((a, b) => names.ordinal(a.keys) - names.ordinal(b.keys)
    || (a.window.start ?? '').localeCompare(b.window.start ?? '') || a.first - b.first);
  const noSales = (row: Row): boolean => row.observations.length > 0 && row.observations.every(observation => isZero(observedDecimal(observation)));
  // Back-to-back windows with no recorded sale for the same product read as one row, never as a sum.
  const rows: Row[] = [];
  for (const row of ordered) {
    const previous = rows.at(-1);
    if (previous && noSales(previous) && noSales(row) && JSON.stringify(previous.keys) === JSON.stringify(row.keys)
      && nextDay(previous.window.end) !== null && nextDay(previous.window.end) === row.window.start) {
      rows[rows.length - 1] = { ...previous, window: { start: previous.window.start, end: row.window.end },
        observations: [...previous.observations, ...row.observations], periods: previous.periods + row.periods };
    } else rows.push(row);
  }
  const cell = (observations: readonly Observation[] | undefined): string => {
    if (!observations?.length) return 'Chưa có dữ liệu';
    return observations.map(observation => {
      const decimal = observedDecimal(observation);
      if (isZero(decimal)) return 'Không ghi nhận';
      return formatReaderValue(decimal, { measure: observation.measure?.literal, unit: observation.measure?.unit, currency: observation.measure?.currency }) ?? 'Chưa có dữ liệu';
    }).join('; ');
  };
  const body = rows.map(row => {
    const values = noSales(row)
      ? `<td colspan="${measures.length}">${row.periods > 1 ? `Không ghi nhận bán trong ${escape(formatReaderCount(row.periods) ?? 'các')} kỳ liền nhau` : 'Không ghi nhận bán trong kỳ'}</td>`
      : measures.map(measure => `<td>${escape(cell(row.cells.get(measure)))}</td>`).join('');
    return `<tr><td>${escape(names.label(row.keys))}</td><td>${escape(windowText(row.window))}</td>${values}<td>${marks(row.observations.map(observation => observation.source), trace)}</td></tr>`;
  }).join('');
  const headers = measures.map(measure => `<th>${escape(capitalized(readerMeasureName(measure)))}${vnd.has(measure) ? ' (VND)' : ''}</th>`).join('');
  return '<p class="warning">Mỗi dòng là một kỳ đo riêng của một sản phẩm được chọn. Không cộng các kỳ thành tổng năm, không tính tăng trưởng và không gọi đây là quy mô thị trường.</p>' +
    `<div class="table-wrap" role="region" aria-label="Số liệu theo kỳ của sản phẩm được chọn" tabindex="0"><table><caption>Số liệu theo từng kỳ đo của các sản phẩm được chọn</caption><thead><tr><th>Sản phẩm</th><th>Kỳ đo</th>${headers}<th>Nguồn</th></tr></thead><tbody>${body || `<tr><td colspan="${3 + measures.length}">Chưa có số liệu theo kỳ dùng được.</td></tr>`}</tbody></table></div>` +
    '<p class="lim"><b>Chú thích:</b> Số liệu lấy từ trang chi tiết của từng sản phẩm, theo từng kỳ đo. Bảng mẫu sản phẩm lấy từ trang kết quả tìm kiếm với kỳ và cách làm tròn khác, nên số của cùng một sản phẩm ở hai nơi có thể lệch nhau. “Không ghi nhận bán” là nguồn không ghi lượt bán nào trong kỳ đó.</p>';
}

/** Provider product id in the quote's stored offer text, matched to a run member key. */
function quoteMemberKey(quote: Quote, keys: readonly string[]): string | null {
  let id: unknown;
  try { id = (JSON.parse(quote.offerText ?? '') as { provider_product_id?: unknown } | null)?.provider_product_id; } catch { return null; }
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  const text = String(id);
  return keys.find(key => key === text || key.slice(key.lastIndexOf(':') + 1) === text) ?? null;
}

/** M08 reader view: listed price range once per product, then revenue ÷ units per query window as an estimate. */
function readerPriceSection(snapshot: AutomationMarketMethodSnapshot, trace: Trace, productLabels: ReadonlyMap<string, string> | undefined): string {
  const names = productNamer(snapshot, productLabels);
  const captures = new Map<string, { keys: readonly string[]; window: Window }>();
  for (const observation of snapshot.temporal.input.observations) {
    const ordinal = /^capture-(\d+)-/.exec(observation.observationId ?? '')?.[1];
    if (ordinal !== undefined && !captures.has(ordinal)) captures.set(ordinal, { keys: observation.subjectMemberKeys ?? [], window: observationWindow(observation) });
  }
  const knownKeys = [...new Set([...names.keys(), ...snapshot.temporal.input.observations.flatMap(observation => observation.subjectMemberKeys ?? [])])];
  type Estimate = { keys: readonly string[]; window: Window | null; value: string; quote: Quote; index: number };
  type Listed = { keys: readonly string[]; label: string | null; ranges: Map<string, { minimum: string; maximum: string }>; sources: Quote['source'][]; index: number };
  const estimates: Estimate[] = [], listed = new Map<string, Listed>();
  let noSale = 0, unreadable = 0;
  snapshot.quotes.input.quotes.forEach((quote, index) => {
    const capture = captures.get(/^capture-(\d+)-/.exec(quote.quoteId)?.[1] ?? '');
    const member = capture ? null : quoteMemberKey(quote, knownKeys);
    const keys = capture?.keys ?? (member ? [member] : []);
    if (quote.price.value !== null) {
      if (isZero(quote.price.value)) noSale += 1;
      else estimates.push({ keys, window: capture?.window ?? null, value: quote.price.value, quote, index });
    } else if (quote.price.range) {
      const id = keys.length ? JSON.stringify(keys) : `quote:${index}`;
      const row: Listed = listed.get(id) ?? { keys, label: keys.length ? null : readerQuoteLabel(quote.quoteId, index + 1), ranges: new Map(), sources: [], index };
      row.ranges.set(`${quote.price.range.minimum}|${quote.price.range.maximum}`, quote.price.range);
      row.sources.push(quote.source);
      listed.set(id, row);
    } else unreadable += 1;
  });
  const money = (value: string): string => formatReaderValue(value, { currency: 'VND' }) ?? 'Giá được giữ trong bản lưu';
  const product = (keys: readonly string[], fallback: string): string => keys.length ? names.label(keys) : fallback;
  const listedRows = [...listed.values()].sort((a, b) => names.ordinal(a.keys) - names.ordinal(b.keys) || a.index - b.index).flatMap(row =>
    [...row.ranges.values()].map(range => `<tr><td>${escape(product(row.keys, row.label ?? 'Sản phẩm chưa xác định'))}</td><td>${escape(money(range.minimum))}</td><td>${escape(money(range.maximum))}</td><td>${marks(row.sources, trace)}</td></tr>`)).join('');
  const estimateRows = estimates.sort((a, b) => names.ordinal(a.keys) - names.ordinal(b.keys) || (a.window?.start ?? '').localeCompare(b.window?.start ?? '') || a.index - b.index)
    .map(row => `<tr><td>${escape(product(row.keys, readerQuoteLabel(row.quote.quoteId, row.index + 1)))}</td><td>${escape(windowText(row.window))}</td><td>${escape(money(row.value))}</td><td>${trace(row.quote.source)}</td></tr>`).join('');
  const parts = ['<p class="warning">Chưa rõ phiên bản, combo hay điều kiện giá. Không tính biên lợi nhuận và không so sánh như cùng loại hàng.</p>'];
  if (listedRows) parts.push('<div class="table-wrap" role="region" aria-label="Giá do nguồn ghi cho từng sản phẩm" tabindex="0"><table><caption>Giá do nguồn ghi cho từng sản phẩm</caption><thead><tr><th>Sản phẩm</th><th>Giá thấp nhất (VND)</th><th>Giá cao nhất (VND)</th><th>Nguồn</th></tr></thead><tbody>' + listedRows + '</tbody></table></div>' +
    '<p class="lim"><b>Chú thích:</b> Giá thấp nhất và cao nhất do nguồn ghi cho sản phẩm; hai số bằng nhau khi nguồn chỉ ghi một mức giá.</p>');
  if (estimateRows) parts.push('<div class="table-wrap" role="region" aria-label="Doanh thu chia sản lượng bán theo kỳ" tabindex="0"><table><caption>Doanh thu chia sản lượng bán theo kỳ (ước tính, không phải giá niêm yết)</caption><thead><tr><th>Sản phẩm</th><th>Kỳ đo</th><th>Doanh thu chia sản lượng bán (VND)</th><th>Nguồn</th></tr></thead><tbody>' + estimateRows + '</tbody></table></div>' +
    `<p class="lim"><b>Chú thích:</b> Số ước tính bằng doanh thu chia sản lượng bán trong từng kỳ; có thể khác giá nguồn ghi vì khuyến mãi, phiên bản hoặc combo.${noSale ? ' Kỳ không có lượt bán thì không có số ước tính nên không đưa vào bảng.' : ''}</p>`);
  if (!listedRows && !estimateRows) parts.push(`<p>Chưa có giá nguồn dùng được.${noSale ? ' Các kỳ đã lưu không có lượt bán nên không có số ước tính.' : ''}</p>`);
  if (unreadable) parts.push(`<p>Có ${escape(formatReaderCount(unreadable) ?? 'một số')} bản ghi giá không đọc được; không đưa vào bảng.</p>`);
  return parts.join('');
}
