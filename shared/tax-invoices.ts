import { z } from 'zod';
export const taxEnvironment = z.enum(['test', 'production']);
export const taxDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
 const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v;
}, '날짜를 확인해 주세요.');
const text = (max:number) => z.string().trim().min(1).max(max);
export const invoiceParty = z.object({
 corpNum:z.string().regex(/^\d{10}$/), name:text(200), ceo:text(100), address:text(300),
 bizType:z.string().trim().max(100).default(''), bizClass:z.string().trim().max(100).default(''),
 contact:text(100), email:z.string().trim().email().max(100),
});
export const invoiceLine=z.object({name:text(100),qty:z.string().max(12),unitPrice:z.string().max(18),amount:z.number().int().min(-999999999999).max(999999999999),tax:z.number().int().min(-99999999999).max(99999999999),description:z.string().max(40)});
export const invoiceDraft = z.object({
 supplier:invoiceParty, buyer:invoiceParty, date:taxDate, purpose:z.enum(['1','2']),
 item:text(100), amount:z.number().int().positive().max(999999999999),
 lines:z.array(invoiceLine).min(1).max(99).optional(),
 tax:z.number().int().min(0).max(99999999999), remark:z.string().trim().max(150).default(''),
}).refine(v=>!v.lines||(v.lines.reduce((s,l)=>s+l.amount,0)===v.amount&&v.lines.reduce((s,l)=>s+l.tax,0)===v.tax),'품목 합계가 일치하지 않습니다.').refine(v=>Math.abs(v.tax-v.amount/10)<=Math.max(1,v.lines?.length||1), '일반 과세 세액을 확인해 주세요.').refine(v=>v.buyer.corpNum!==v.supplier.corpNum,'공급자와 공급받는자가 같습니다.');
export type InvoiceDraft = z.infer<typeof invoiceDraft>;
export const blankParty = {corpNum:'',name:'',ceo:'',address:'',bizType:'',bizClass:'',contact:'',email:''};
