// Charts through Microsoft Flint (flint-chart 0.5.1) → Vega-Lite 6 → Vega 6 static
// SVG, the same engine as the approved golden reports. Everything runs in
// process with inline data: no network, no files. The libraries load lazily so
// pages that only use the hand-drawn SVG charts never pay for them.
import type { ChartAssemblyInput } from 'flint-chart';

export const FLINT_ENGINE = 'flint-chart@0.5.1 → vega-lite@6.4.3 → vega@6.4.0';

/** Fixed colour per value of a colour field, e.g. { san: { Shopee: '#c2410c', 'TikTok Shop': '#1d2327' } }. */
export type FlintPalette = Record<string, Record<string, string>>;
export type FlintChartInput = Omit<ChartAssemblyInput, 'data'> & { data: { values: Record<string, unknown>[] } };
export type RenderedChart = { svg: string; engine: 'flint' | 'svg-fallback'; error?: string };

type Libraries = {
  assembleVegaLite: (input: ChartAssemblyInput) => any;
  compile: (spec: any) => { spec: any };
  vega: typeof import('vega');
};
let libraries: Promise<Libraries> | null = null;
function load(): Promise<Libraries> {
  return libraries ??= (async () => {
    // vega-lite's own .d.ts does not pass exactOptionalPropertyTypes, so it is
    // imported untyped; only `compile` is used.
    const vegaLite: string = 'vega-lite';
    const [{ assembleVegaLite }, { compile }, vega] = await Promise.all([
      import('flint-chart'), import(vegaLite) as Promise<Pick<Libraries, 'compile'>>, import('vega'),
    ]);
    // Vietnamese number style inside charts: 28,9 and 1.000.000.
    vega.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', 'đ'] });
    return { assembleVegaLite, compile, vega };
  })();
}

function fixColor(node: unknown, palette: FlintPalette, legend: boolean | undefined): void {
  if (!node || typeof node !== 'object') return;
  const color = (node as { encoding?: { color?: { field?: string; scale?: object; legend?: null } } }).encoding?.color;
  const p = color?.field ? palette[color.field] : undefined;
  if (color && p) {
    const domain = Object.keys(p);
    color.scale = { ...(color.scale ?? {}), domain, range: domain.map(k => p[k]) };
    if (legend === false) color.legend = null;
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') fixColor(v, palette, legend);
}

/** Renders one Flint chart to SVG. Titles stay in the HTML around the figure, so the SVG omits them. */
export async function renderFlintChart(
  input: FlintChartInput,
  { palette = {}, theme = 'datawrapper', legend, patch }: { palette?: FlintPalette; theme?: string; legend?: boolean; patch?: (spec: any) => void } = {},
): Promise<string> {
  const L = await load();
  const { title: _title, subtitle: _subtitle, ...bare } = input.chart_spec as ChartAssemblyInput['chart_spec'] & { title?: unknown; subtitle?: unknown };
  const spec = L.assembleVegaLite({
    ...input,
    theme_spec: theme,
    chart_spec: { baseSize: { width: 560, height: 260 }, canvasSize: { width: 760, height: 520 }, ...bare },
  } as ChartAssemblyInput);
  fixColor(spec, palette, legend);
  patch?.(spec);
  const view = new L.vega.View(L.vega.parse(L.compile(spec).spec), { renderer: 'none' });
  try {
    return (await view.toSVG()).replace(/ width="\d+(\.\d+)?" height="\d+(\.\d+)?" viewBox/, ' viewBox');
  } finally {
    view.finalize();
  }
}

/** Flint first; on any failure the hand-drawn SVG is used and the reason is kept for the build log. */
export async function renderChart(input: FlintChartInput, fallback: () => string, options?: Parameters<typeof renderFlintChart>[1]): Promise<RenderedChart> {
  try {
    return { svg: await renderFlintChart(input, options), engine: 'flint' };
  } catch (error) {
    return { svg: fallback(), engine: 'svg-fallback', error: error instanceof Error ? error.message : String(error) };
  }
}
