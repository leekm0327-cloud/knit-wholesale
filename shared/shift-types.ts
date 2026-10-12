import {z} from 'zod';
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hours=z.object({start:time,end:time}).refine(h=>h.start<h.end,'종료 시간은 시작 시간 이후여야 합니다.');
export const shiftTypesSchema=z.array(z.object({id:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,49}$/),label:z.string().trim().min(1).max(30),enabled:z.boolean(),role:z.enum(['none','recipe','production','waste']),weekday:hours,weekend:hours})).min(1).max(30).refine(rows=>new Set(rows.map(r=>r.id)).size===rows.length,'시프트 식별자가 중복됩니다.').refine(rows=>rows.some(r=>r.enabled),'최소 한 개의 시프트를 사용해 주세요.');
export type ShiftType=z.infer<typeof shiftTypesSchema>[number];
export const defaultShiftTypes:ShiftType[]=[
 {id:'Open',label:'Open',enabled:true,role:'recipe',weekday:{start:'07:30',end:'16:30'},weekend:{start:'08:30',end:'17:30'}},
 {id:'Baker',label:'Baker',enabled:true,role:'production',weekday:{start:'08:00',end:'17:00'},weekend:{start:'08:00',end:'17:00'}},
 {id:'Close',label:'Close',enabled:true,role:'waste',weekday:{start:'08:30',end:'17:30'},weekend:{start:'09:30',end:'18:30'}},
 {id:'Close2',label:'Close 2',enabled:true,role:'waste',weekday:{start:'08:30',end:'17:30'},weekend:{start:'09:30',end:'18:30'}},
 {id:'Part',label:'Part',enabled:true,role:'none',weekday:{start:'12:00',end:'15:00'},weekend:{start:'12:00',end:'15:00'}},
];
export function visibleShiftTypes(types:ShiftType[],shifts:{position:string}[]=[]){const rows=types.filter(t=>t.enabled||shifts.some(s=>s.position===t.id));const known=new Set(rows.map(r=>r.id));return [...rows,...Array.from(new Set(shifts.map(s=>s.position))).filter(id=>!known.has(id)).map(id=>({...defaultShiftTypes[4],id,label:id||'기존 근무',enabled:false}))];}
