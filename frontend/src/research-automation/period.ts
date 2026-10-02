// Requested research period (ADR 0015): Vietnam only, inclusive dates, 365-day default.
// Presets resolve to explicit dates; editing either date switches the preset to Custom.

export type PeriodPreset = 'D30' | 'D90' | 'D180' | 'D365' | 'M24' | 'CALENDAR_YEAR' | 'CUSTOM';

export interface PeriodDraft {
  readonly preset: PeriodPreset;
  readonly startDate: string;
  readonly endDate: string;
}

export const periodPresets: readonly PeriodPreset[] = ['D30', 'D90', 'D180', 'D365', 'M24', 'CALENDAR_YEAR', 'CUSTOM'];

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's calendar date in Vietnam, independent of the browser time zone. */
export function vietnamToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function presetLabel(preset: PeriodPreset, today: string): string {
  switch (preset) {
    case 'D30': return '30 ngày';
    case 'D90': return '90 ngày';
    case 'D180': return '180 ngày';
    case 'D365': return '365 ngày';
    case 'M24': return '24 tháng';
    case 'CALENDAR_YEAR': return `Năm ${Number(today.slice(0, 4)) - 1}`;
    case 'CUSTOM': return 'Tùy chọn';
  }
}

/** Resolves a preset to explicit inclusive dates ending today (Calendar year: the last full year). */
export function resolvePreset(preset: Exclude<PeriodPreset, 'CUSTOM'>, today: string): PeriodDraft {
  if (preset === 'CALENDAR_YEAR') {
    const year = Number(today.slice(0, 4)) - 1;
    return { preset, startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  if (preset === 'M24') return { preset, startDate: addDays(addMonths(today, -24), 1), endDate: today };
  const days = preset === 'D30' ? 30 : preset === 'D90' ? 90 : preset === 'D180' ? 180 : 365;
  return { preset, startDate: addDays(today, -(days - 1)), endDate: today };
}

export function defaultPeriod(today: string): PeriodDraft {
  return resolvePreset('D365', today);
}

/** Any manual date edit keeps the other date and becomes Custom. */
export function editPeriodDate(draft: PeriodDraft, field: 'startDate' | 'endDate', value: string): PeriodDraft {
  return { ...draft, preset: 'CUSTOM', [field]: value };
}

/** Number of calendar days from start to end, both included; null when either date is invalid or reversed. */
export function inclusiveDays(startDate: string, endDate: string): number | null {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start === null || end === null || start > end) return null;
  return Math.round((end - start) / DAY_MS) + 1;
}

export function periodProblem(draft: PeriodDraft, today: string): string | null {
  if (parseIsoDate(draft.startDate) === null || parseIsoDate(draft.endDate) === null) return 'Nhập đủ ngày bắt đầu và ngày kết thúc.';
  if (draft.startDate > draft.endDate) return 'Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.';
  if (draft.endDate > today) return 'Ngày kết thúc không được sau hôm nay.';
  const days = inclusiveDays(draft.startDate, draft.endDate);
  if (days !== null && days > 1096) return 'Kỳ nghiên cứu không được dài hơn 1.096 ngày.';
  return null;
}

function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null;
}

function formatIsoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return formatIsoDate((parseIsoDate(value) ?? 0) + days * DAY_MS);
}

/** Calendar month shift; a day missing in the target month clamps to its last day (29 Feb -> 28 Feb). */
function addMonths(value: string, months: number): string {
  const date = new Date(parseIsoDate(value) ?? 0);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return formatIsoDate(target.getTime());
}
