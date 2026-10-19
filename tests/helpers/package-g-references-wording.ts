import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from './market14-full-fixture.js';

export const WORDING_LANES = ['capture', 'no-capture'] as const;
export const WORDING_ROWS = [
  { name: 'negation retains its meaning', pattern: /không phải không/u, absent: true },
  { name: 'percentage unit has no leading space after parenthesis', pattern: /\( phần trăm/u, absent: true },
  { name: 'missing value is distinct from zero', pattern: /Thiếu giá trị · không phải số không/u, absent: false },
  { name: 'percentage after a digit has exactly one space', pattern: /Tỷ trọng trong mẫu: 81,08 phần trăm\./u, absent: false },
  { name: 'recorded zero after là remains a number', pattern: /Giá trị ghi nhận là số không\./u, absent: false },
] as const;

export async function wordingInput(lane: typeof WORDING_LANES[number]): Promise<AutomationReportInput> {
  const input = await fullMarket14Input();
  const { capture, ...withoutCapture } = input.metricMethods!;
  return { ...input,
    metricMethods: lane === 'capture' ? { ...input.metricMethods!, capture: { ...capture!, rowPolicyVersion: 'automation-metric-capture-v3' } } : withoutCapture,
    // Authored chart metadata passes through the full reader pipeline. It is not a retained source quote.
    // The spaced input percentage distinguishes the old formatter's two spaces from the required one.
    marketPresentationCharts: input.marketPresentationCharts!.map(chart => chart.kind !== 'concentration' ? chart : { ...chart,
      note: chart.note + ' Thiếu giá trị · không phải 0. Giá trị ghi nhận là 0. Tỷ trọng trong mẫu: 81,08 %.',
    }),
  };
}

export function assertWording(row: typeof WORDING_ROWS[number], html: string): void {
  const dom = new JSDOM(html);
  try {
    for (const node of dom.window.document.querySelectorAll('style, script, svg, q, [data-quote], blockquote, pre, code, details, [hidden], [aria-hidden="true"]')) node.remove();
    // Do not collapse whitespace: that would conceal the percentage regression.
    const prose = dom.window.document.body.textContent ?? '';
    if (row.absent) assert.doesNotMatch(prose, row.pattern, row.name);
    else assert.match(prose, row.pattern, row.name);
  } finally { dom.window.close(); }
}
