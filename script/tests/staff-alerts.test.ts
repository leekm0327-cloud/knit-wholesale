import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createStaffAlertService, decideClockOut, initStaffAlerts, noteDailySubmission, queueSupplyAlert, readAlertState, requestClockOut, scheduledDeliveries, snoozeClockOut, validateAlertTemplate } from '../../server/staff-alerts';
import { defaultAlertConfig, effectiveHours, kstStamp, templateNames, alertKinds, type AlertKind } from '../../shared/staff-alerts';
import { initSupplyWorkflow, registerSupplyWorkflow } from '../../server/supply-workflow';
import express from 'express';

const native = new DatabaseSync(':memory:');
const db:any={prepare:(s:string)=>native.prepare(s),exec:(s:string)=>native.exec(s),transaction:(f:any)=>(...args:any[])=>{native.exec('BEGIN');try{const r=f(...args);native.exec('COMMIT');return r;}catch(e){native.exec('ROLLBACK');throw e;}}};
db.exec(`CREATE TABLE staff(id INTEGER PRIMARY KEY,name TEXT,phone TEXT,active INTEGER);
CREATE TABLE shifts(id INTEGER PRIMARY KEY,staff_id INTEGER,work_date TEXT,position TEXT,start_time TEXT,end_time TEXT);
CREATE TABLE leave_requests(id INTEGER PRIMARY KEY,staff_id INTEGER,status TEXT,half_day INTEGER,start_date TEXT,end_date TEXT);
CREATE TABLE attendance(id INTEGER PRIMARY KEY,staff_id INTEGER,work_date TEXT,clock_in_at INTEGER,clock_out_at INTEGER,edited_by_admin INTEGER DEFAULT 0);
CREATE TABLE espresso_logs(id INTEGER PRIMARY KEY,log_date TEXT);
CREATE TABLE dessert_logs(id INTEGER PRIMARY KEY,prod_date TEXT,produced_at INTEGER,discarded_at INTEGER);
CREATE TABLE supply_orders(id INTEGER PRIMARY KEY,order_date TEXT,vendor TEXT,body TEXT,amount INTEGER,staff_id INTEGER,staff_name TEXT,created_at INTEGER,updated_at INTEGER);`);
initSupplyWorkflow(db); initStaffAlerts(db); initStaffAlerts(db);
db.exec(`INSERT INTO staff VALUES(1,'이강민','01000000001',1),(2,'박대건','01000000002',1),(3,'오픈직원','01000000003',1),(4,'베이커','01000000004',1),(5,'마감직원','01000000005',1),(6,'휴직','01000000006',0),(7,'번호없음','',1);`);
const day='2026-09-15';
let now=kstStamp('2026-09-14','19:00');
const routes:Record<AlertKind,string>={supply_order:'/staff/supply',supply_received:'/staff/supply',clock_in:'/staff',clock_out:'/staff',recipe:'/staff/espresso',waste:'/staff/dessert',production:'/staff/dessert'};
const templates=alertKinds.map(k=>({templateId:k,name:templateNames[k][0],status:'APPROVED',content:k.startsWith('supply')?'#{등록자} #{거래처} #{발주내용}':'#{이름} #{근무일}',buttons:[{buttonType:'WL',linkMo:'https://wholesale.knitcoffee.co.kr/#'+routes[k]}]}));
let sent:any[]=[];let ambiguous=false;
const deps:any={ready:()=>[],templates:async()=>templates,template:async(id:string)=>templates.find(t=>t.templateId===id),notify:async()=>{},send:async(p:any)=>{sent.push(p);if(ambiguous)throw Error('timeout');return {ok:true,detail:'접수'};}};
const service=createStaffAlertService(db,deps,()=>now);
await service.connect(0,1);
assert.deepEqual(readAlertState(db).config.recipients,[1,2]);
assert.equal(readAlertState(db).config.enabled,false,'connecting must not send');
await service.save({...readAlertState(db).config,enabled:true},1,1);
assert.equal(readAlertState(db).scheduleFrom,day);
assert.throws(()=>validateAlertTemplate('clock_out',{...templates[3],content:'#{비밀번호}'}),/변수/);
assert.throws(()=>validateAlertTemplate('clock_out',{...templates[3],buttons:[{linkMo:'https://evil.example/#/staff'}]}),/주소/);
assert.throws(()=>validateAlertTemplate('clock_out',{...templates[3],status:'PENDING'}),/승인/);
const weekday=effectiveHours(defaultAlertConfig,{workDate:day,position:'Open',startTime:'',endTime:''});assert.equal(weekday?.start,'07:30');
assert.equal(effectiveHours(defaultAlertConfig,{workDate:'2026-09-19',position:'Close2',startTime:'',endTime:''})?.end,'18:30');
assert.equal(effectiveHours(defaultAlertConfig,{workDate:'2026-09-24',position:'Open',startTime:'',endTime:''})?.start,'08:30');
assert.equal(effectiveHours(defaultAlertConfig,{workDate:day,position:'Part',startTime:'13:00',endTime:'16:00'})?.start,'13:00');
assert.equal(effectiveHours(defaultAlertConfig,{workDate:day,position:'Open',startTime:'25:00',endTime:'26:00'}),null);
for(const [id,staff,position] of [[1,3,'Open'],[2,4,'Baker'],[3,5,'Close'],[4,6,'Open'],[5,7,'Part']] as const) db.prepare('INSERT INTO shifts VALUES(?,?,?,?,?,?)').run(id,staff,day,position,'','');
now=kstStamp(day,'07:34');await service.tick();assert.equal(sent.length,0);
now=kstStamp(day,'07:35');await Promise.all([service.tick(),service.tick()]);assert.equal(sent.length,1);assert.equal(sent[0].phone,'01000000003');assert.equal(sent[0].disableSms,true);
await createStaffAlertService(db,deps,()=>now).tick();assert.equal(sent.length,1,'restart duplicate blocked');
db.prepare('INSERT INTO attendance VALUES(1,3,?,?,NULL,0)').run(day,kstStamp(day,'07:36'));
db.prepare('INSERT INTO attendance VALUES(2,4,?,?,NULL,0)').run(day,kstStamp(day,'08:00'));
db.prepare('INSERT INTO attendance VALUES(3,5,?,?,NULL,0)').run(day,kstStamp(day,'08:30'));
now=kstStamp(day,'08:30');await service.tick();assert.equal(sent.filter(p=>p.kind==='오픈 레시피').length,1);
db.prepare('INSERT INTO espresso_logs VALUES(1,?)').run(day);assert.equal(scheduledDeliveries(db,now).some(d=>d.kind==='recipe'),false);
// A saved zero is completion even with no dessert row.
noteDailySubmission(db,day,'discard',5);noteDailySubmission(db,day,'produce',4);
now=kstStamp(day,'17:15');assert.equal(scheduledDeliveries(db,now).some(d=>d.kind==='waste'||d.kind==='production'),false);
now=kstStamp(day,'16:34');assert.equal(scheduledDeliveries(db,now).some(d=>d.kind==='clock_out'&&d.staffId===3),false);
now=kstStamp(day,'16:35');await service.tick();assert.equal(sent.filter(p=>p.kind==='퇴근 기록 확인'&&p.phone==='01000000003').length,1);
const snooze=snoozeClockOut(db,3,day,now);assert.equal(snooze.until,now+30*60000);assert.equal(snoozeClockOut(db,3,day,now).count,1,'repeated click is idempotent');
await service.tick();assert.equal(sent.filter(p=>p.kind==='퇴근 기록 확인'&&p.phone==='01000000003').length,1);
now+=30*60000;await service.tick();assert.equal(sent.filter(p=>p.kind==='퇴근 기록 확인'&&p.phone==='01000000003').length,2);
const req=requestClockOut(db,3,day,kstStamp(day,'16:32'),'퇴근 버튼 누락',now);assert.equal(db.prepare('SELECT clock_out_at FROM attendance WHERE id=1').get().clock_out_at,null);
assert.throws(()=>requestClockOut(db,3,day,kstStamp(day,'16:32'),'중복',now),/대기/);
assert.equal(scheduledDeliveries(db,now).some(d=>d.kind==='clock_out'&&d.staffId===3),false,'pending approval suppresses reminders');
decideClockOut(db,req,true,1,'',now);assert.equal(db.prepare('SELECT clock_out_at FROM attendance WHERE id=1').get().clock_out_at,kstStamp(day,'16:32'));
assert.throws(()=>decideClockOut(db,req,true,1,'',now),/처리/);
assert.throws(()=>requestClockOut(db,1,day,now,'다른 직원',now),/본인/);
const stale=requestClockOut(db,4,day,kstStamp(day,'17:00'),'누락',now);
db.prepare('UPDATE attendance SET clock_in_at=clock_in_at+1 WHERE id=2').run();
assert.throws(()=>decideClockOut(db,stale,true,1,'',now),/바뀌/);assert.equal(db.prepare('SELECT status FROM staff_attendance_requests WHERE id=?').get(stale).status,'pending');decideClockOut(db,stale,false,1,'현재 기록 확인',now);
// Rescheduled / leave / inactive staff must not get old reminders.
db.prepare('UPDATE shifts SET end_time=? WHERE id=3').run('19:00');now=kstStamp(day,'17:35');assert.equal(scheduledDeliveries(db,now).some(d=>d.kind==='clock_out'&&d.staffId===5),false);
db.prepare("INSERT INTO leave_requests VALUES(1,5,'approved',0,?,?)").run(day,day);assert.equal(scheduledDeliveries(db,kstStamp(day,'19:05')).some(d=>d.staffId===5),false);
assert.equal(scheduledDeliveries(db,kstStamp('2027-01-01','12:00')).length,0,'unconfirmed holiday year suppressed');
// Event hooks: pending request does not notify; purchase and receipt do, once each per recipient.
db.prepare('INSERT INTO supply_orders VALUES(1,?,?,?,?,?,?,?,?)').run(day,'테스트 공급사','우유 3개',12000,3,'오픈직원',now,now);
db.prepare("INSERT INTO supply_order_meta(order_id,status) VALUES(1,'ordered')").run();
queueSupplyAlert(db,1,'supply_order','오픈직원',now);queueSupplyAlert(db,1,'supply_order','오픈직원',now);
await service.tick();assert.equal(sent.filter(p=>p.kind==='발주 안내').length,2);
db.prepare("UPDATE supply_order_meta SET status='received' WHERE order_id=1").run();queueSupplyAlert(db,1,'supply_received','마감직원',now);await service.tick();assert.equal(sent.filter(p=>p.kind==='입고 완료 안내').length,2);
// Unknown paid-send result must not be retried, including after a service restart.
db.prepare('INSERT INTO supply_orders SELECT 2,order_date,vendor,body,amount,staff_id,staff_name,created_at,updated_at FROM supply_orders WHERE id=1').run();
db.prepare("INSERT INTO supply_order_meta(order_id,status) VALUES(2,'ordered')").run();ambiguous=true;queueSupplyAlert(db,2,'supply_order','오픈직원',now);await service.tick();const count=sent.length;await createStaffAlertService(db,deps,()=>now).tick();assert.equal(sent.length,count);assert.equal(db.prepare("SELECT count(*) AS n FROM staff_alert_outbox WHERE status='unknown'").get().n,2);ambiguous=false;
// Disabling cancels queued work and does not backfill historical orders on re-enable.
let state=readAlertState(db);await service.save({...state.config,enabled:false},state.version,1);queueSupplyAlert(db,99,'supply_order','직원',now);await service.tick();assert.equal(sent.length,count);
await assert.rejects(()=>service.save({...state.config,enabled:true},state.version,1),/다른 화면/);
// Exercise the actual supply route integration with fake sessions and no network sends.
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={staffId:3};next();});
let hooks:string[]=[];registerSupplyWorkflow(app,db,(_req,_res,next)=>next(),undefined,(_id,kind)=>hooks.push(kind));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${(server.address() as any).port}`;
try{
 const fields={orderDate:day,vendor:'테스트',body:'우유',amount:10000,destination:'매장',expectedDate:day,link:'',note:''};
 const r=await fetch(origin+'/api/staff/supply-board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,status:'needed'})});const row:any=await r.json();assert.equal(r.status,200);assert.deepEqual(hooks,[]);
 const ordered=await fetch(origin+`/api/staff/supply-board/${row.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'ordered',note:'',version:row.updatedAt,order:fields})});const next:any=await ordered.json();assert.equal(ordered.status,200);assert.deepEqual(hooks,['supply_order']);
 const received=await fetch(origin+`/api/staff/supply-board/${row.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'received',note:'',version:next.updatedAt})});assert.equal(received.status,200);assert.deepEqual(hooks,['supply_order','supply_received']);
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
console.log('PASS: approval-only connection, shift defaults/holidays/overrides, record suppression including zero, 5-minute timing, restart/concurrency dedupe, snooze, owner correction/stale protection, leave/inactive exclusion, supply lifecycle, ambiguous result no retry, activation cutoff.');
