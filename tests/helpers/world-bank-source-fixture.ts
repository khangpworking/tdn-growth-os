/** Synthetic World Bank v2 endpoint shape; these names/units/numbers are test evidence only. */
export function worldBankFixture(code = 'SP.POP.TOTL', values = ['12345678901234567890.123456789', '0', 'null']) {
  const name = 'Synthetic population indicator';
  const records = values.map((value, index) => JSON.stringify({ indicator: { id: code, value: name },
    country: { id: 'VN', value: 'Viet Nam' }, countryiso3code: 'VNM', date: String(2025 - index),
    value: '__EXACT_VALUE__', unit: '', obs_status: '', decimal: 0, ...(index === 0 ? { footnote: 'Synthetic estimate note' } : {}) })
    .replace('"__EXACT_VALUE__"', value));
  const observations = Buffer.from(`[${JSON.stringify({ page: 1, pages: 1, per_page: 1000, total: values.length,
    sourceid: '2', lastupdated: '2026-07-13' })},[${records.join(',')}]]`);
  const metadata = Buffer.from(JSON.stringify([{ page: 1, pages: 1, per_page: 50, total: 1 }, [{
    id: code, name, unit: '', source: { id: '2', value: 'Synthetic dataset' },
    sourceNote: 'Synthetic definition; not a country estimate note.', sourceOrganization: 'Synthetic attribution', topics: [],
  }]]));
  return { observations, metadata, sourceUrl: `https://api.worldbank.org/v2/country/VN/indicator/${code}?format=json`,
    metadataUrl: `https://api.worldbank.org/v2/indicator/${code}?format=json` };
}
