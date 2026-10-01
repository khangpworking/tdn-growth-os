import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import inputSchema from '../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import outputSchema from '../../../contracts/analysis/metric-scope-output.schema.json' with { type: 'json' };
import type { MetricScopeInput, Observation } from '../../../contracts/analysis/metric-scope-input.generated.js';
import type { MetricScopeOutput, Scope, Total, Ratio } from '../../../contracts/analysis/metric-scope-output.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(inputSchema);
const validateInput = ajv.getSchema<MetricScopeInput>(inputSchema.$id)!;
const validateOutput = ajv.compile<MetricScopeOutput>(outputSchema);
type Row = MetricScopeInput['records'][number];
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sha = (v: unknown): string => createHash('sha256').update(canonicalJson(v)).digest('hex');
const ks = [1, 3, 10] as const;

/** A1 classifiers may only depend on these frozen fields; new inputs require a method revision. */
export function metricLabelFingerprint(platform: MetricScopeInput['scope']['platform'], row: Pick<Row, 'shopId' | 'listingId' | 'title' | 'category'>): string {
  return sha({ platform, shopId: row.shopId, listingId: row.listingId, title: row.title, category: row.category });
}

/** Validate and freeze normalized input without executing any market calculation. */
export function validateMetricScopeInput(value: unknown): MetricScopeInput {
  if (!validateInput(value)) throw new TypeError(`Invalid normalized Metric input: ${ajv.errorsText(validateInput.errors)}`);
  const input = value as MetricScopeInput;
  if (input.scope.start > input.scope.end) throw new TypeError('Reporting period is reversed');
  const sources = new Set(input.sources.map(s => s.sha256));
  if (sources.size !== input.sources.length) throw new TypeError('Duplicate source digest');
  const identities = new Set<string>();
  for (const [index, row] of input.records.entries()) {
    if (canonicalJson(row.measurement) !== canonicalJson({ profileId: input.profileId, scopeKey: input.scope.key,
      platform: input.scope.platform, selection: input.scope.selection, start: input.scope.start, end: input.scope.end, currency: 'VND' })) throw new TypeError(`Measurement scope/period/profile mismatch at record ${index}`);
    const id = canonicalJson([row.shopId, row.listingId]);
    if (identities.has(id)) throw new TypeError(`Duplicate listing identity at record ${index}`);
    identities.add(id);
    const refs = [row.source, row.revenue.source, row.units.source, ...(row.label ? [row.label.source] : [])];
    if (refs.some(ref => !sources.has(ref.sourceSha256))) throw new TypeError(`Unknown evidence source at record ${index}`);
    for (const key of ['revenue', 'units'] as const) {
      const { state, value: n } = row[key];
      if ((state === 'missing' && n !== null) || (state === 'observed_zero' && n !== '0') ||
          (state === 'observed_value' && (n === null || n === '0'))) throw new TypeError(`Numeric state mismatch at record ${index}/${key}`);
    }
  }
  // The caller cannot change provenance underneath a returned calculation.
  return JSON.parse(canonicalJson(input)) as MetricScopeInput;
}

function total(values: Observation[]): Total {
  const observed = values.filter(v => v.value !== null);
  return { value: observed.length ? observed.reduce((a, v) => a + BigInt(v.value!), 0n).toString() : null,
    observedCount: observed.length, missingCount: values.length - observed.length,
    nonExactCount: observed.filter(v => v.precision !== 'exact').length, complete: values.length > 0 && observed.length === values.length };
}

function ratio(numerator: bigint, denominator: bigint): Ratio | null {
  if (denominator === 0n) return null;
  const scaled = numerator * 10000n;
  let q = scaled / denominator;
  const remainder = scaled % denominator;
  if (2n * remainder > denominator || (2n * remainder === denominator && q % 2n === 1n)) q++;
  return { numerator: numerator.toString(), denominator: denominator.toString(), percent: `${q / 100n}.${(q % 100n).toString().padStart(2, '0')}` };
}

function scope(input: MetricScopeInput, key: Scope['key'], indices: number[], blocked = false, withRemoval = true): Scope {
  const rows = indices.map(i => input.records[i]!);
  const revenue = total(rows.map(r => r.revenue)), units = total(rows.map(r => r.units));
  const shopKey = (r: Row): string => canonicalJson([input.scope.platform, r.shopId]);
  const shopGroups = new Map<string, Row[]>(), groups = new Map<string, Row[]>();
  for (const row of rows) {
    const shop = shopKey(row);
    if (!shopGroups.has(shop)) shopGroups.set(shop, []);
    shopGroups.get(shop)!.push(row);
    const validLabel = row.label && row.label.methodVersion === input.labelCodebookVersion && row.label.contentSha256 === metricLabelFingerprint(input.scope.platform, row);
    const group = validLabel ? row.label!.group : 'UNKNOWN';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(row);
  }
  const shops = [...shopGroups].map(([shopKey, rs]) => ({ shopKey, revenue: total(rs.map(r => r.revenue)), units: total(rs.map(r => r.units)) }))
    .sort((a, b) => {
      const x = BigInt(a.revenue.value ?? '0'), y = BigInt(b.revenue.value ?? '0');
      return x === y ? compare(a.shopKey, b.shopKey) : x > y ? -1 : 1;
    });
  const warnings: Scope['warnings'] = [];
  if (blocked) warnings.push('LABELS_REQUIRE_ADJUDICATION');
  else if (!rows.length) warnings.push('EMPTY_SCOPE');
  if (revenue.missingCount) warnings.push('MISSING_REVENUE');
  if (units.missingCount) warnings.push('MISSING_UNITS');
  if (revenue.nonExactCount) warnings.push('NON_EXACT_REVENUE');
  if (units.nonExactCount) warnings.push('NON_EXACT_UNITS');
  if (revenue.value === '0') warnings.push('ZERO_REVENUE');
  const comparable = !blocked && revenue.missingCount === 0 && revenue.value !== null;
  const leader = comparable && withRemoval ? shops[0] : undefined;
  const remainder = leader ? scope(input, key, indices.filter(i => shopKey(input.records[i]!) !== leader.shopKey), false, false) : null;
  return { key, status: blocked ? 'BLOCKED_LABELS' : 'CALCULATED', recordIndices: indices,
    listingCount: rows.length, shopCount: shops.length, revenue, units, warnings, shops,
    groups: [...groups].sort(([a], [b]) => compare(a, b)).map(([group, rs]) => ({ group, listingCount: rs.length, revenue: total(rs.map(r => r.revenue)), units: total(rs.map(r => r.units)),
      revenueShare: comparable ? ratio(BigInt(total(rs.map(r => r.revenue)).value!), BigInt(revenue.value!)) : null })),
    concentration: ks.map(k => ({ k, usedShopCount: Math.min(k, shops.length), share: comparable ? ratio(shops.slice(0, k).reduce((a, s) => a + BigInt(s.revenue.value!), 0n), BigInt(revenue.value!)) : null })),
    withoutTopShop: leader && remainder ? { removedShopKey: leader.shopKey, listingCount: remainder.listingCount, revenue: remainder.revenue, shops: remainder.shops, concentration: remainder.concentration,
      remainingRevenueShare: remainder.listingCount ? ratio(BigInt(remainder.revenue.value!), BigInt(revenue.value!)) : null } : null };
}

function comparison(all: Scope, selected: Scope): MetricScopeOutput['comparisons'][number] {
  const complete = all.revenue.missingCount === 0 && selected.revenue.missingCount === 0 && all.revenue.value !== null && selected.revenue.value !== null;
  const ranks = new Map(all.shops.map((shop, i) => [shop.shopKey, i + 1]));
  return { from: 'all', to: selected.key as 'wide' | 'core',
    removedRecordIndices: all.recordIndices.filter(i => !selected.recordIndices.includes(i)),
    revenueDelta: complete ? (BigInt(selected.revenue.value!) - BigInt(all.revenue.value!)).toString() : null,
    unitsDelta: all.units.complete && selected.units.complete ? (BigInt(selected.units.value!) - BigInt(all.units.value!)).toString() : null,
    commonShopRanks: complete ? selected.shops.map((s, i) => ({ shopKey: s.shopKey, fromRank: ranks.get(s.shopKey)!, toRank: i + 1, delta: i + 1 - ranks.get(s.shopKey)! })) : [],
    topShopRetention: complete ? ks.map(k => ({ k, commonShopKeys: selected.shops.slice(0, k).filter(s => all.shops.slice(0, k).some(a => a.shopKey === s.shopKey)).map(s => s.shopKey) })) : [] };
}

export function calculateMetricScopes(value: unknown): MetricScopeOutput {
  const input = validateMetricScopeInput(value);
  const labelIssues: MetricScopeOutput['labelIssues'] = [];
  input.records.forEach((row, i) => {
    const reason = !row.label ? 'MISSING_LABEL' : row.label.contentSha256 !== metricLabelFingerprint(input.scope.platform, row) ? 'STALE_LABEL' : row.label.methodVersion !== input.labelCodebookVersion ? 'CODEBOOK_MISMATCH' : null;
    if (reason) labelIssues.push({ recordIndex: i, reason });
  });
  const all = scope(input, 'all', input.records.map((_, i) => i));
  if (labelIssues.length) all.warnings.push('LABELS_REQUIRE_ADJUDICATION');
  const wide = scope(input, 'wide', labelIssues.length ? [] : input.records.flatMap((r, i) => r.label!.classification !== 'OUTSIDE' && (r.label!.classification !== 'UNKNOWN' || input.wideUnknownPolicy === 'include') ? [i] : []), labelIssues.length > 0);
  const core = scope(input, 'core', labelIssues.length ? [] : input.records.flatMap((r, i) => r.label!.classification === 'CORE_CANDIDATE' ? [i] : []), labelIssues.length > 0);
  const output: MetricScopeOutput = { contractVersion: '1.0.0', methodVersion: 'metric-scope-v1', rendererVersion: 'metric-draft-vi-v1', rounding: 'percent-half-even-2-v1', status: 'DRAFT', verification: 'NORMALIZED_INPUT_ONLY',
    inputSha256: sha(input), input, labelIssues, scopes: [all, wide, core], comparisons: labelIssues.length ? [] : [comparison(all, wide), comparison(all, core)] };
  if (!validateOutput(output)) throw new Error(`Invalid calculation output: ${ajv.errorsText(validateOutput.errors)}`);
  return output;
}

/** Fixed quantitative statements only. No model, strategy, causal or health claims. */
export function renderMetricScopeDraft(output: MetricScopeOutput): string {
  // Rendering arbitrary edited payloads must not let numbers and narrative drift.
  if (!validateOutput(output) || canonicalJson(calculateMetricScopes(output.input)) !== canonicalJson(output)) throw new TypeError('Calculation payload failed deterministic replay');
  const literal = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]#|]/g, c => `&#${c.charCodeAt(0)};`);
  const lines = ['# Bản nháp định lượng thị trường', '', '> DRAFT — chưa phải kết luận được OWNER duyệt. Chỉ kiểm đầu vào chuẩn hóa, chưa xác minh ô dữ liệu nguồn.', '',
    `Phạm vi: ${literal(output.input.scope.key)} · ${output.input.scope.platform} · ${output.input.scope.selection}`,
    `Kỳ đo: ${output.input.scope.start} → ${output.input.scope.end}. Thu nhận: ${output.input.scope.acquiredAt ?? 'chưa xác nhận — không suy đoán từ kỳ đo hoặc ngày sửa file'}.`,
    `Cơ sở kỳ đo: ${literal(output.input.scope.periodBasis)}`, `Phương pháp: ${output.methodVersion} · ${output.rounding} · ${output.rendererVersion}`, `Profile: ${literal(output.input.profileId)} · Codebook: ${literal(output.input.labelCodebookVersion)} · UNKNOWN trong wide: ${output.input.wideUnknownPolicy}`, `Đầu vào SHA-256: ${output.inputSha256}`, '',
    'Không cộng ON/OFF; listing không đồng nghĩa sản phẩm độc lập. Không suy diễn thị phần toàn ngành, động cơ mua, hiệu quả sức khỏe hoặc nhân quả.', ''];
  for (const [i, s] of output.scopes.entries()) {
    lines.push(`## Phạm vi ${s.key}`, '');
    if (s.status === 'BLOCKED_LABELS') { lines.push('Chưa tính: nhãn thiếu, chưa xác định hoặc không còn khớp nội dung; cần phân xử lại.', ''); continue; }
    lines.push(`${s.listingCount} listing · ${s.shopCount} shop.`,
      `Doanh thu ${s.revenue.missingCount ? 'cộng phần quan sát' : 'trong tập quan sát'}: ${s.revenue.value ?? 'không có dữ liệu'} VND; thiếu ${s.revenue.missingCount} dòng; ${s.revenue.nonExactCount} dòng không có độ chính xác exact. [metric: /scopes/${i}/revenue]`,
      `Sản lượng quan sát: ${s.units.value ?? 'không có dữ liệu'}; thiếu ${s.units.missingCount} dòng. [metric: /scopes/${i}/units]`);
    for (const [j, c] of s.concentration.entries()) lines.push(`Top ${c.k} shop (thực dùng ${c.usedShopCount}): ${c.share ? c.share.percent + '%; mẫu số ' + c.share.denominator + ' VND' : 'chưa đủ điều kiện tính tỷ trọng'}. [metric: /scopes/${i}/concentration/${j}]`);
    lines.push(`Cảnh báo: ${s.warnings.join(', ') || 'không có cảnh báo tính toán; không đồng nghĩa nguồn đã xác minh'}.`, '', '| Shop ID theo nền tảng | Doanh thu quan sát VND | Dòng thiếu |', '|---|---:|---:|');
    for (const shop of s.shops) lines.push(`| ${literal(shop.shopKey)} | ${shop.revenue.value ?? 'thiếu'} | ${shop.revenue.missingCount} |`);
    lines.push('');
    lines.push('| Nhóm nhãn | Listing | Doanh thu quan sát VND | Tỷ trọng trong phạm vi |', '|---|---:|---:|---:|');
    for (const g of s.groups) lines.push(`| ${literal(g.group)} | ${g.listingCount} | ${g.revenue.value ?? 'thiếu'} | ${g.revenueShare ? g.revenueShare.percent + '%' : 'chưa tính'} |`);
    lines.push(`[metric: /scopes/${i}/groups]`, '');
    if (s.withoutTopShop) {
      const r = s.withoutTopShop;
      lines.push(`Độ nhạy bỏ shop đứng đầu ${literal(r.removedShopKey)}: còn ${r.listingCount} listing, doanh thu ${r.revenue.value ?? 'không có dữ liệu'} VND. Đây là phép tính độ nhạy, không phải dự báo. [metric: /scopes/${i}/withoutTopShop]`, '');
    }
  }
  lines.push('## Độ nhạy theo phạm vi', '', 'Chênh lệch dưới đây không phải tăng trưởng thị trường hoặc quan hệ nhân quả.', '');
  for (const [i, c] of output.comparisons.entries()) lines.push(`- all → ${c.to}: chênh doanh thu ${c.revenueDelta ?? 'chưa đủ dữ liệu'} VND; chênh sản lượng ${c.unitsDelta ?? 'chưa đủ dữ liệu'}; loại ${c.removedRecordIndices.length} dòng khỏi membership. [metric: /comparisons/${i}]`);
  lines.push('## Dấu vết nguồn', '', 'Locator dưới đây do đầu vào cung cấp; A1 chưa mở nguồn để xác minh. Payload JSON kèm theo giữ mọi quan sát, nhãn và locator.', '');
  for (const source of output.input.sources) lines.push(`- ${literal(source.label)} · ${source.sha256} · ${literal(source.evidenceFamily)} · ${source.representationRole} · ${literal(source.provenanceBasis)}`);
  for (const [i, r] of output.input.records.entries()) lines.push(`- /input/records/${i}: ${r.source.sourceSha256} — ${literal(r.source.locator)}; revenue: ${r.revenue.source.sourceSha256} — ${literal(r.revenue.source.locator)}; units: ${r.units.source.sourceSha256} — ${literal(r.units.source.locator)}`);
  return lines.join('\n') + '\n';
}
