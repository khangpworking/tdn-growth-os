import { resolveMetricAvailableEndDate } from '../src/modules/analysis/research-automation/metric-capture-runner.js';
import { METRIC_V3_STOP_CODES } from '../src/modules/analysis/research-automation/metric-v3-capture-spec.js';

const validDate = (value: string | undefined): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

async function main() {
  const [requestedEndDate, ...extra] = process.argv.slice(2);
  if (!validDate(requestedEndDate) || extra.length) throw new Error('ARG_INVALID');
  // Explicit calendar interaction only. captureRoot is unused by the resolver;
  // no capture folder, run, database or artifact is created by this command.
  const lastSelectableDate = await resolveMetricAvailableEndDate({ enabledEnv: '1', captureRoot: process.cwd() }, requestedEndDate);
  if (!validDate(lastSelectableDate) || lastSelectableDate > requestedEndDate) throw new Error('METRIC_DATE_CHECK_FAILED');
  const available = lastSelectableDate === requestedEndDate;
  process.stdout.write(`${JSON.stringify({ format: 'metric-date-availability-v1', requestedEndDate,
    lastSelectableDate, available, errorCode: available ? null : 'CAPTURE_PERIOD_NOT_SELECTABLE' })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  const code = METRIC_V3_STOP_CODES.find(code => code === message) ??
    (['ARG_INVALID', 'EXECUTOR_NOT_CONFIGURED', 'CAPTURE_INTERRUPTED', 'TIMEOUT'].includes(message)
      ? message : 'METRIC_DATE_CHECK_FAILED');
  process.stdout.write(`${JSON.stringify({ format: 'error-v1', code, message: code })}\n`);
  process.exitCode = 2;
});
