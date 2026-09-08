import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerWorkspaceFeatures } from '../../server/workspace-features';
const db:any=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE staff(id INTEGER,name TEXT);INSERT INTO staff VALUES(1,'직원 A');CREATE TABLE shifts(id INTEGER,staff_id INTEGER,work_date TEXT,start_time TEXT,end_time TEXT,position TEXT);INSERT INTO shifts VALUES(1,1,'2026-09-08','09:00','18:00','바');CREATE TABLE staff_events(id INTEGER,title TEXT,kind TEXT,start_date TEXT,end_date TEXT,memo TEXT);INSERT INTO staff_events VALUES(1,'행사','event','2026-09-07','2026-09-09','준비');CREATE TABLE customers(id INTEGER);INSERT INTO customers VALUES(1),(2);CREATE TABLE visit_requests(id INTEGER,customer_id INTEGER,business_name TEXT,confirmed_date TEXT,preferred_date1 TEXT,status TEXT,message TEXT,admin_memo TEXT,created_at INTEGER);INSERT INTO visit_requests VALUES(1,1,'비공개 상호','2026-09-08','','confirmed','신청','비밀 메모',1);CREATE TABLE chat_messages(id INTEGER,customer_id INTEGER,sender TEXT,body TEXT,created_at INTEGER);INSERT INTO chat_messages VALUES(1,1,'customer','첫 고객 메시지',1),(2,2,'customer','다른 고객 메시지',2);`);
const app=express();app.use(express.json());
const guard=(roles:string[])=>(req:any,res:any,next:any)=>roles.includes(req.headers['x-role'])?next():res.sendStatus(403);
const summary:any={from:'2026-09-01',to:'2026-09-30',coverage:{from:'2026-09-08',to:'2026-09-08'},totals:{amount:10000,qty:2,days:1},byDate:[{date:'2026-09-08',qty:2,amount:10000}],byProduct:[{product:'Coffee',category:'Coffee',qty:2,amount:10000}],netProfit:9999};
registerWorkspaceFeatures(app,db,{admin:guard(['owner','manager']),owner:guard(['owner']),staff:guard(['staff'])},{getPosSummary:async()=>summary});
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as any).port;
async function call(path:string,role='owner',method='GET',body?:any){const r=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{'x-role':role,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};}
try{
 assert.equal((await call('admin/manuals','staff')).status,403);
 assert.equal((await call('staff/manuals','none')).status,403);
 const draft={title:'레시피',category:'음료 레시피',body:'실제 제조 방법',published:false};
 const created=await call('admin/manuals','manager','POST',draft);assert.equal(created.status,200);
 assert.equal((await call('staff/manuals','staff')).data.length,0);
 await call('admin/manuals/'+created.data.id,'manager','PUT',{...draft,published:true,version:1});
 assert.equal((await call('staff/manuals','staff')).data.length,1);
 assert.equal((await call('admin/manuals/'+created.data.id,'owner','PUT',{...draft,version:1})).status,409);
 await call('admin/manuals/'+created.data.id,'owner','PUT',{...draft,version:2});assert.equal((await call('staff/manuals','staff')).data.length,0);
 assert.equal((await call('admin/store-performance?from=2026-09-01&to=2026-09-30','manager')).status,403);
 assert.deepEqual((await call('staff/store-performance?from=2026-09-01&to=2026-09-30','staff')).data,{shared:false});
 assert.equal((await call('admin/performance-sharing','staff','PUT',{})).status,403);
 await call('admin/performance-sharing','owner','PUT',{revenue:false,quantity:true,products:true,weekdays:true});
 const performance=(await call('staff/store-performance?from=2026-09-01&to=2026-09-30','staff')).data;
 assert.equal(performance.qty,2);assert.equal(performance.weekdays[2].days,1);assert(!JSON.stringify(performance).includes('amount'));assert(!JSON.stringify(performance).includes('netProfit'));
 assert.equal((await call('admin/store-performance?from=2026-02-31&to=2026-09-30')).status,400);
 const calendar=(await call('staff/operations-calendar?from=2026-09-01&to=2026-09-30','staff')).data;
 assert.equal(calendar.length,3);assert(!JSON.stringify(calendar).includes('비밀'));assert(!JSON.stringify(calendar).includes('비공개 상호'));
 const ctx=(await call('admin/customers/1/context')).data;assert.equal(ctx.messages.length,1);assert.equal(ctx.messages[0].body,'첫 고객 메시지');
 await call('admin/customers/1/followups','owner','POST',{body:'확인할 일',dueDate:'2026-09-09'});
 const n=(await call('admin/customers/1/context')).data.notes[0];assert.equal((await call('admin/customers/2/followups/'+n.id,'owner','PATCH',{done:true})).status,404);
 assert.equal((await call('admin/customers/1/context','staff')).status,403);
 console.log('PASS: auth boundaries, private drafts, publish/unpublish, edit conflicts, owner-only sharing, no hidden financial fields, date validation, calendar privacy, customer isolation');
}finally{server.close();}
