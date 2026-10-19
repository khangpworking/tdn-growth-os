import test from 'node:test';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { assertWording, wordingInput, WORDING_LANES, WORDING_ROWS } from '../helpers/package-g-references-wording.js';

const reports = new Map<string, Promise<string>>();
for (const lane of WORDING_LANES) for (const row of WORDING_ROWS) {
  test(`G-references report-text contract: ${lane}: ${row.name}`, async () => {
    let report = reports.get(lane);
    if (!report) {
      report = wordingInput(lane).then(input => buildResearchAutomationReport(input, 'MARKET').html.toString());
      reports.set(lane, report);
    }
    assertWording(row, await report);
  });
}
