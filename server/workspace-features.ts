import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { PosSummary } from '../shared/schema';
import type { Sharing, Performance } from '../shared/workspace-features';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;});
const range=z.object({from:date,to:date}).refine(v=>v.to>=v.from&&Date.parse(v.to)-Date.parse(v.from)<=366*86400000,'조회 기간은 1년 이내로 선택해 주세요.');
const manual=z.object({title:z.string().trim().min(1).max(100),category:z.enum(['음료 레시피','디저트 레시피','오픈·마감','장비·청소','응대·기타']),body:z.string().trim().min(1).max(20000),published:z.boolean(),version:z.number().int().nonnegative().optional()});
const sharing=z.object({revenue:z.boolean(),quantity:z.boolean(),products:z.boolean(),weekdays:z.boolean()});
const emptySharing:Sharing={revenue:false,quantity:false,products:false,weekdays:false};
const fullSharing:Sharing={revenue:true,quantity:true,products:true,weekdays:true};
export function projectPerformance(s:PosSummary,flags:Sharing):Performance {
 const totals=(v:{qty:number;amount:number})=>({...flags.quantity?{qty:v.qty}:{},...flags.revenue?{amount:v.amount}:{}});
 const dayCounts=new Map<number,number>();s.byDate.forEach(d=>{const wd=new Date(d.date+'T00:00:00Z').getUTCDay();dayCounts.set(wd,(dayCounts.get(wd)||0)+1);});
 // Weekday figures use the same product-day source as totals, avoiding hourly import coverage mismatch.
 const weekdays=Array.from({length:7},(_,weekday)=>{const rows=s.byDate.filter(d=>new Date(d.date+'T00:00:00Z').getUTCDay()===weekday);return {weekday,days:dayCounts.get(weekday)||0,...totals({qty:rows.reduce((a,d)=>a+d.qty,0),amount:rows.reduce((a,d)=>a+d.amount,0)})};});
 return {from:s.from,to:s.to,coverage:s.coverage,days:s.totals.days,sharing:flags,...totals(s.totals),...flags.products?{products:s.byProduct.map(p=>({product:p.product,category:p.category,...totals(p)})).sort((a,b)=>flags.quantity?(b.qty||0)-(a.qty||0):flags.revenue?(b.amount||0)-(a.amount||0):a.product.localeCompare(b.product))}:{},...flags.weekdays?{weekdays}:{}};
}
export function registerWorkspaceFeatures(app:Express,db:Database.Database,auth:{admin:RequestHandler;owner:RequestHandler;staff:RequestHandler},storage:{getPosSummary:(from:string,to:string,category?:string,groupOrigin?:boolean)=>Promise<PosSummary>}) {
 db.exec(`CREATE TABLE IF NOT EXISTS operation_manuals(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,category TEXT NOT NULL,body TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS performance_sharing(id INTEGER PRIMARY KEY CHECK(id=1),settings TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS customer_followups(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER NOT NULL,body TEXT NOT NULL,due_date TEXT NOT NULL DEFAULT '',done INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);`);
 const safe=(fn:(req:any,res:any)=>unknown):RequestHandler=>(req,res,next)=>{Promise.resolve().then(()=>fn(req,res)).catch(e=>e instanceof z.ZodError?res.status(400).json({message:e.errors[0].message}):next(e));};
 const id=(v:unknown)=>z.coerce.number().int().positive().parse(v);
 const selectManual=`SELECT id,title,category,body,published,version,updated_at AS updatedAt FROM operation_manuals`;
 const settings=():Sharing=>{const row=db.prepare('SELECT settings FROM performance_sharing WHERE id=1').get() as any;return row?sharing.parse(JSON.parse(row.settings)):emptySharing;};
 for(const [prefix,guard,isStaff] of [['/api/admin',auth.admin,false],['/api/staff',auth.staff,true]] as const){
  app.get(prefix+'/manuals',guard,safe((_req,res)=>res.json(db.prepare(selectManual+(isStaff?' WHERE published=1':'')+' ORDER BY updated_at DESC,id DESC').all())));
  app.get(prefix+'/operations-calendar',guard,safe((req,res)=>{const {from,to}=range.parse(req.query);
   const shifts=db.prepare(`SELECT s.id,s.work_date AS date,s.start_time AS startTime,s.end_time AS endTime,s.position,p.name FROM shifts s LEFT JOIN staff p ON p.id=s.staff_id WHERE s.work_date BETWEEN ? AND ? ORDER BY s.start_time`).all(from,to) as any[];
   const events=db.prepare(`SELECT id,title,kind,start_date AS date,end_date AS endDate,memo FROM staff_events WHERE start_date<=? AND end_date>=?`).all(to,from) as any[];
   const visits=db.prepare(`SELECT id,business_name AS businessName,confirmed_date AS date FROM visit_requests WHERE substr(confirmed_date,1,10) BETWEEN ? AND ? AND status IN ('confirmed','done')`).all(from,to) as any[];
   res.json([...shifts.map(s=>({id:'shift-'+s.id,date:s.date,endDate:s.date,title:s.name||'미등록 직원',kind:'근무',detail:`${s.startTime}–${s.endTime} ${s.position||''}`,href:isStaff?'/staff/schedule':'/admin/staff/schedule'})),...events.map(e=>({id:'event-'+e.id,date:e.date,endDate:e.endDate,title:e.title,kind:e.kind==='order'?'단체주문':e.kind==='event'?'행사':'기타·점검',detail:e.memo,href:isStaff?'/staff/handover':'/admin/staff/handover'})),...visits.map(v=>({id:'visit-'+v.id,date:v.date.slice(0,10),endDate:v.date.slice(0,10),title:isStaff?'거래처 방문 세팅':v.businessName+' 방문 세팅',kind:'방문 세팅',detail:'확정 일정',...!isStaff?{href:'/admin/visit-setups'}:{}}))]);
  }));
 }
 app.post('/api/admin/manuals',auth.admin,safe((req,res)=>{const p=manual.parse(req.body);const result=db.prepare('INSERT INTO operation_manuals(title,category,body,published,updated_at) VALUES(?,?,?,?,?)').run(p.title,p.category,p.body,+p.published,Date.now());res.json(db.prepare(selectManual+' WHERE id=?').get(result.lastInsertRowid));}));
 app.put('/api/admin/manuals/:id',auth.admin,safe((req,res)=>{const p=manual.extend({version:z.number().int().positive()}).parse(req.body);const result=db.prepare('UPDATE operation_manuals SET title=?,category=?,body=?,published=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(p.title,p.category,p.body,+p.published,Date.now(),id(req.params.id),p.version);if(!result.changes)return res.status(409).json({message:'다른 관리자가 수정했거나 문서가 없습니다. 목록을 새로고침해 확인해 주세요.'});res.json({ok:true});}));
 app.get('/api/admin/performance-sharing',auth.owner,safe((_req,res)=>res.json(settings())));
 app.put('/api/admin/performance-sharing',auth.owner,safe((req,res)=>{const s=sharing.parse(req.body);db.prepare('INSERT INTO performance_sharing(id,settings) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings').run(JSON.stringify(s));res.json(s);}));
 app.get('/api/admin/store-performance',auth.owner,safe(async(req,res)=>{const {from,to}=range.parse(req.query);res.json(projectPerformance(await storage.getPosSummary(from,to,undefined,false),fullSharing));}));
 app.get('/api/staff/store-performance',auth.staff,safe(async(req,res)=>{const flags=settings();if(!Object.values(flags).some(Boolean))return res.json({shared:false});const {from,to}=range.parse(req.query);const summary=await storage.getPosSummary(from,to,undefined,false);res.json({shared:true,...projectPerformance(summary,flags)});}));
 app.get('/api/admin/customers/:id/context',auth.admin,safe((req,res)=>{const customerId=id(req.params.id);if(!db.prepare('SELECT id FROM customers WHERE id=?').get(customerId))return res.status(404).json({message:'거래처가 없습니다.'});res.json({messages:db.prepare('SELECT id,sender,body,created_at AS createdAt FROM chat_messages WHERE customer_id=? ORDER BY created_at DESC LIMIT 20').all(customerId),visits:db.prepare('SELECT id,confirmed_date AS date,preferred_date1 AS preferredDate,status,message,admin_memo AS memo FROM visit_requests WHERE customer_id=? ORDER BY created_at DESC').all(customerId),notes:db.prepare('SELECT id,body,due_date AS dueDate,done,created_at AS createdAt FROM customer_followups WHERE customer_id=? ORDER BY done,created_at DESC').all(customerId)});}));
 app.post('/api/admin/customers/:id/followups',auth.admin,safe((req,res)=>{const customerId=id(req.params.id);if(!db.prepare('SELECT id FROM customers WHERE id=?').get(customerId))return res.status(404).json({message:'거래처가 없습니다.'});const p=z.object({body:z.string().trim().min(1).max(2000),dueDate:z.union([date,z.literal('')])}).parse(req.body);db.prepare('INSERT INTO customer_followups(customer_id,body,due_date,created_at) VALUES(?,?,?,?)').run(customerId,p.body,p.dueDate,Date.now());res.json({ok:true});}));
 app.patch('/api/admin/customers/:id/followups/:noteId',auth.admin,safe((req,res)=>{const p=z.object({done:z.boolean()}).parse(req.body);const r=db.prepare('UPDATE customer_followups SET done=? WHERE id=? AND customer_id=?').run(+p.done,id(req.params.noteId),id(req.params.id));if(!r.changes)return res.status(404).json({message:'메모가 없습니다.'});res.json({ok:true});}));
}
