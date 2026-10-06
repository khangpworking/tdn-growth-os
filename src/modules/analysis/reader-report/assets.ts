import fs from 'node:fs';

// Versioned, bundled assets (see assets/reader-report-v1/README.md). Nothing is
// fetched at build or view time, so a retained reader report opens offline.
const ASSET_ROOT = new URL('../../../../assets/reader-report-v1/', import.meta.url);
const ranges = {
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
};
export const READER_FONT_WEIGHTS = [400, 600, 700, 800] as const;

let fontCss: string | undefined;
export function readerReportFontCss(): string {
  return fontCss ??= Object.entries(ranges).flatMap(([subset, range]) => READER_FONT_WEIGHTS.map(weight => {
    const bytes = fs.readFileSync(new URL(`be-vietnam-pro/be-vietnam-pro-${subset}-${weight}-normal.woff2`, ASSET_ROOT));
    return `@font-face{font-family:"Be Vietnam Pro";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');unicode-range:${range}}`;
  })).join('\n');
}

export type PlatformIcons = { shopee: string; tiktok: string };
let icons: PlatformIcons | undefined;
/** Shopee/TikTok marks as SVG text. */
export function readerReportPlatformIcons(): PlatformIcons {
  return icons ??= {
    shopee: fs.readFileSync(new URL('icons/shopee.svg', ASSET_ROOT), 'utf8'),
    tiktok: fs.readFileSync(new URL('icons/tiktok.svg', ASSET_ROOT), 'utf8'),
  };
}
