// Reader-report kit: the shared core for building the owner-facing "bản đọc"
// of a market report. A profile classifies rows, a bundle holds every number,
// narrative reaches numbers only through {{id}}, and lint guards the output.
export * from './format.js';
export * from './bundle.js';
export * from './classify.js';
export * from './scope-metrics.js';
export * from './svg-charts.js';
export * from './assets.js';
export * from './layout.js';
export * from './lint.js';
export * from './build.js';
export * from './flint.js';
export * from './source-assets.js';
export { CSS as READER_CSS, CSS_COVER as READER_CSS_COVER, CSS_KIT as READER_CSS_KIT } from './theme.js';
