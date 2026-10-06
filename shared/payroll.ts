import { z } from 'zod';
import { alertDay, alertTime } from './staff-alerts';
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const minutesOf = (s: string) => Number(s.slice(0,2))*60+Number(s.slice(3));
const day = z.object({ weekday:z.number().int().min(0).max(6), start:alertTime, end:alertTime, breakMinutes:z.number().int().min(0).max(480) }).strict().refine(d=>minutesOf(d.end)>minutesOf(d.start)+d.breakMinutes,'종료·휴게 시간을 확인해 주세요.').refine(d=>minutesOf(d.end)-minutesOf(d.start)-d.breakMinutes<=480,'계약 소정근로시간은 하루 8시간 이내로 입력해 주세요.');
export const contractSchema=z.object({
 id:z.number().int().positive().optional(), staffId:z.number().int().positive(), from:alertDay, to:alertDay.nullable(), hourlyWage:z.number().int().min(1).max(1000000),
 days:z.array(day).min(1).max(6), holidayWeekday:z.number().int().min(0).max(6), normalDaysPerWeek:z.number().int().min(1).max(6),
 workplaceSize:z.enum(['under5','5plus','unknown']), reason:z.string().trim().min(1).max(500)
}).strict().superRefine((c,x)=>{
 if(c.to&&c.to<c.from)x.addIssue({code:'custom',message:'계약 종료일을 확인해 주세요.'});
 if(new Set(c.days.map(d=>d.weekday)).size!==c.days.length)x.addIssue({code:'custom',message:'요일은 한 번씩만 지정해 주세요.'});
 if(c.days.some(d=>d.weekday===c.holidayWeekday))x.addIssue({code:'custom',message:'주휴일과 계약 근무일을 구분해 주세요.'});
 if(c.days.reduce((s,d)=>s+minutesOf(d.end)-minutesOf(d.start)-d.breakMinutes,0)>2400)x.addIssue({code:'custom',message:'주 소정근로시간은 40시간 이내로 입력해 주세요.'});
});
export type PayrollContract=z.infer<typeof contractSchema>;
export const dayDecisionSchema=z.object({date:alertDay, paidMinutes:z.number().int().min(0).max(1440), attendance:z.enum(['present','absent','paidLeave','excluded']), supplement:z.number().int().min(0).max(10000000), reason:z.string().trim().min(1).max(500), fingerprint:z.string().min(1).max(100)}).strict();
export type DayDecision=z.infer<typeof dayDecisionSchema>;
export const weekDecisionSchema=z.object({date:alertDay, minutes:z.number().min(0).max(480),reason:z.string().trim().min(1).max(500),fingerprint:z.string().min(1).max(100)}).strict();
export const monthDecisionSchema=z.object({month:monthSchema, additions:z.number().int().min(0).max(100000000),deductions:z.number().int().min(0).max(100000000),reason:z.string().trim().min(1).max(500),fingerprint:z.string().min(1).max(100)}).strict();
export type PayrollDay={date:string;contract:PayrollContract|null;scheduledMinutes:number;paidMinutes:number;hourlyWage:number;amount:number;supplement:number;clockIn:string;clockOut:string;actualMinutes:number|null;attendance:string;issues:string[];pending:boolean;fingerprint:string;decision:DayDecision|null};
export type PayrollWeek={date:string;from:string;scheduledAverage:number;suggestedMinutes:number;minutes:number;hourlyWage:number;amount:number;issues:string[];pending:boolean;fingerprint:string;reason:string;reviewed:boolean};
export type PayrollReport={staffId:number;name:string;month:string;days:PayrollDay[];weeks:PayrollWeek[];contracts:PayrollContract[];basePay:number;weeklyPay:number;supplements:number;additions:number;deductions:number;gross:number;net:number;pending:number;warnings:string[];fingerprint:string;monthReason:string;confirmationKey:string;confirmed:boolean;confirmedAt:number|null;history:{kind:string;key:string;reason:string;at:number;actor:number}[]};
