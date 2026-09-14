import { z } from 'zod';

export const alertKinds = ['supply_order', 'supply_received', 'clock_in', 'clock_out', 'recipe', 'waste', 'production'] as const;
export type AlertKind = typeof alertKinds[number];
export const alertLabels: Record<AlertKind, string> = {
  supply_order: '발주 안내', supply_received: '입고 완료 안내', clock_in: '출근 기록 확인',
  clock_out: '퇴근 기록 확인', recipe: '오픈 레시피', waste: '마감 폐기량 기록', production: '베이커 생산량 기록',
};
export const templateNames: Record<AlertKind, string[]> = {
  supply_order: ['니트커피 발주 안내'], supply_received: ['니트커피 입고 완료 안내'],
  clock_in: ['니트커피 출근 기록 확인'], clock_out: ['니트커피 퇴근 기록 확인'],
  recipe: ['니트커피 오픈 레시피'], waste: ['니트커피 마감 폐기량 기록'],
  production: ['니트커피 베이커 생산량 기록 확인', '니트커피 베이커 생산량 기혹 확인'],
};
export const alertDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
}, '날짜를 확인해 주세요.');
export const alertTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hours = z.object({ start: alertTime, end: alertTime }).refine(v => v.start < v.end, '종료 시간은 시작 시간 이후여야 합니다.');
const shiftHours = z.object({ Open: hours, Baker: hours, Close: hours, Part: hours });
export const alertConfigSchema = z.object({
  enabled: z.boolean(),
  events: z.object(Object.fromEntries(alertKinds.map(k => [k, z.boolean()])) as Record<AlertKind, z.ZodBoolean>),
  recipients: z.array(z.number().int().positive()).max(10),
  weekday: shiftHours, weekend: shiftHours,
  holidays: z.array(alertDay).max(500),
  holidayYears: z.array(z.number().int().min(2026).max(2100)).min(1).max(30),
  clockInAfter: z.number().int().min(0).max(120), clockOutAfter: z.number().int().min(1).max(120),
  recipeAfter: z.number().int().min(0).max(240), wasteBefore: z.number().int().min(0).max(180),
  productionBefore: z.number().int().min(0).max(180), snoozeMinutes: z.number().int().min(10).max(120),
  maxSnoozes: z.number().int().min(0).max(4),
});
export type AlertConfig = z.infer<typeof alertConfigSchema>;
export const defaultAlertConfig: AlertConfig = {
  enabled: false, events: Object.fromEntries(alertKinds.map(k => [k, true])) as AlertConfig['events'], recipients: [],
  weekday: { Open: { start: '07:30', end: '16:30' }, Baker: { start: '08:00', end: '17:00' }, Close: { start: '08:30', end: '17:30' }, Part: { start: '12:00', end: '15:00' } },
  weekend: { Open: { start: '08:30', end: '17:30' }, Baker: { start: '08:00', end: '17:00' }, Close: { start: '09:30', end: '18:30' }, Part: { start: '12:00', end: '15:00' } },
  // Remaining 2026 holidays; owners can add temporary holidays and confirm subsequent years.
  holidays: ['2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25'], holidayYears: [2026],
  clockInAfter: 5, clockOutAfter: 5, recipeAfter: 60, wasteBefore: 15, productionBefore: 30, snoozeMinutes: 30, maxSnoozes: 2,
};
export const kstDay = (now = Date.now()) => new Date(now + 9 * 3600000).toISOString().slice(0, 10);
export const dayPlus = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const kstStamp = (day: string, time: string) => Date.parse(`${day}T${time}:00+09:00`);
export const mobilePhone = (v: string) => /^01[016789]\d{7,8}$/.test(v.replace(/\D/g, ''));
export function effectiveHours(config: AlertConfig, shift: { workDate: string; position: string; startTime: string; endTime: string }) {
  const slot = (shift.position === 'Close2' ? 'Close' : shift.position) as keyof AlertConfig['weekday'];
  const dow = new Date(shift.workDate + 'T00:00:00Z').getUTCDay();
  const base = (dow === 0 || dow === 6 || config.holidays.includes(shift.workDate) ? config.weekend : config.weekday)[slot];
  const start = shift.startTime || base?.start, end = shift.endTime || base?.end;
  if (!alertTime.safeParse(start).success || !alertTime.safeParse(end).success || start >= end) return null;
  return { start, end, startAt: kstStamp(shift.workDate, start), endAt: kstStamp(shift.workDate, end) };
}
