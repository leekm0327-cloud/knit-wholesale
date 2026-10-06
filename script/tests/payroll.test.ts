// Isolated in-memory SQLite, no production storage or outbound providers.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {registerPayroll,payrollReport} from '../../server/payroll';
import {contractSchema} from '../../shared/payroll';
import {dayPlus,kstStamp} from '../../shared/staff-alerts';
const db:any=new DatabaseSync(':memory:');db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec(`CREATE TABLE staff(id INTEGER PRIMARY KEY,name TEXT,position TEXT,active INTEGER); INSERT INTO staff VALUES(1,'테스트 직원','Part',1);
CREATE TABLE attendance(id INTEGER PRIMARY KEY,staff_id INTEGER,work_date TEXT,clock_in_at INTEGER,clock_out_at INTEGER,break_minutes INTEGER);
CREATE TABLE shifts(id INTEGER PRIMARY KEY,staff_id INTEGER,work_date TEXT,start_time TEXT,end_time TEXT);
CREATE TABLE leave_requests(id INTEGER PRIMARY KEY,staff_id INTEGER,start_date TEXT,end_date TEXT,status TEXT);`);
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:9};next();});
registerPayroll(app,db,(req,res,next)=>req.headers['x-role']==='owner'?next():void res.sendStatus(403),()=>Date.parse('2026-11-02T00:00:00+09:00'));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
async function request(path:string,body?:unknown,role='owner'){const r=await fetch(url+'/api/admin/payroll'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-role':role},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.text().then(t=>{try{return JSON.parse(t);}catch{return t;}})};}
const c={staffId:1,from:'2026-08-01',to:null,hourlyWage:12000,days:[1,2,3,4,5].map(weekday=>({weekday,start:'11:30',end:'14:30',breakMinutes:0})),holidayWeekday:0,normalDaysPerWeek:5,workplaceSize:'under5',reason:'계약서 확인'};
try{
 assert.equal((await request('',undefined,'staff')).status,403);assert.equal((await request('/1/contracts',c,'manager')).status,403);
 assert.equal((await request('/1/contracts',c)).status,200);assert.equal((await request('/1/contracts',c)).status,400,'overlap rejected');
 assert.equal(contractSchema.safeParse({...c,days:[{weekday:1,start:'14:00',end:'11:00',breakMinutes:0}]}).success,false);
 for(let d='2026-08-01';d<='2026-10-31';d=dayPlus(d,1)){if([0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()))continue;db.prepare('INSERT INTO attendance(staff_id,work_date,clock_in_at,clock_out_at,break_minutes) VALUES(1,?,?,?,0)').run(d,kstStamp(d,'11:30'),kstStamp(d,'14:30'));}
 const read=(month='2026-09')=>payrollReport(db,1,month,Date.parse('2026-11-02T00:00:00+09:00'));
 let r=read();assert.equal(r.pending,0);assert.equal(r.basePay,22*36000);assert.equal(r.weeklyPay,4*36000);assert.equal(r.weeks[0].from,'2026-08-31','previous-month work included');
 db.prepare("UPDATE attendance SET clock_in_at=?,clock_out_at=? WHERE work_date='2026-09-01'").run(kstStamp('2026-09-01','11:15'),kstStamp('2026-09-01','14:40'));
 r=read();let d=r.days.find(x=>x.date==='2026-09-01')!;assert.equal(d.paidMinutes,180);assert.equal(d.actualMinutes,205);assert(d.pending);
 assert.equal((await request('/1/day',{date:d.date,paidMinutes:180,attendance:'present',supplement:0,reason:'계약 외 체류 확인',fingerprint:d.fingerprint})).status,200);
 r=read();assert.equal(r.pending,0);assert.equal(r.basePay,22*36000);
 db.prepare("UPDATE attendance SET clock_in_at=? WHERE work_date='2026-09-02'").run(kstStamp('2026-09-02','12:00'));
 r=read();d=r.days.find(x=>x.date==='2026-09-02')!;assert.equal(d.paidMinutes,180,'late arrival not automatically deducted');
 await request('/1/day',{date:d.date,paidMinutes:150,attendance:'present',supplement:0,reason:'30분 지각 소유자 확인',fingerprint:d.fingerprint});
 r=read();assert.equal(r.basePay,22*36000-6000);assert.equal(r.weeklyPay,4*36000,'late does not remove weekly allowance');
 d=r.days.find(x=>x.date==='2026-09-03')!;await request('/1/day',{date:d.date,paidMinutes:0,attendance:'absent',supplement:0,reason:'결근 확인',fingerprint:d.fingerprint});
 r=read();assert.equal(r.weeklyPay,3*36000,'confirmed absence removes only its weekly allowance');
 assert.equal((await request('/1/month',{month:r.month,additions:5000,deductions:1000,reason:'추가 지급과 확인된 공제',fingerprint:r.fingerprint})).status,200);
 r=read();assert.equal(r.gross,r.basePay+r.weeklyPay+5000);assert.equal(r.net,r.gross-1000);
 assert.equal((await request('/1/confirm',{month:r.month,fingerprint:r.fingerprint,confirmationKey:r.confirmationKey,reason:'모두 확인',reviewed:true})).status,200);
 assert(read().confirmed);
 db.prepare("UPDATE attendance SET clock_out_at=? WHERE work_date='2026-09-01'").run(kstStamp('2026-09-01','14:45'));
 r=read();assert(!r.confirmed);assert(r.days[0].pending);assert.equal(r.additions,0,'stale adjustment not silently reused');
 assert.equal((await request('/1/day',{date:d.date,paidMinutes:0,attendance:'absent',supplement:0,reason:'',fingerprint:d.fingerprint})).status,400);
 const wrong={date:'2026-09-01',paidMinutes:180,attendance:'present',supplement:0,reason:'확인',fingerprint:'outdated'};assert.equal((await request('/1/day',wrong)).status,409);
 const id=read().contracts[0].id;await request('/1/contracts',{...c,id,days:[1,2,3,4].map(weekday=>({weekday,start:'11:30',end:'14:30',breakMinutes:0})),reason:'주 12시간'});
 r=read();assert.equal(r.weeklyPay,0,'under 15 hours not eligible');
 await request('/1/contracts',{...c,id,from:'2026-09-01',reason:'입사일 변경'});r=read();assert(r.weeks[0].pending,'first partial four-week window must be reviewed');
 await request('/1/contracts',{...c,id,workplaceSize:'5plus',reason:'5인 이상 기준'});r=read();d=r.days[0];await request('/1/day',{date:d.date,paidMinutes:240,attendance:'present',supplement:0,reason:'추가 근무 1시간',fingerprint:d.fingerprint});r=read();assert.equal(r.days[0].supplement,6000,'contract overtime premium');
 const october=read('2026-10');assert(october.days.find(x=>x.date==='2026-10-09')!.pending,'public holiday reviewed');
 assert(db.prepare('SELECT count(*) AS n FROM payroll_history').get().n>8);assert.equal(db.prepare("SELECT clock_out_at FROM attendance WHERE work_date='2026-09-01'").get().clock_out_at,kstStamp('2026-09-01','14:45'),'payroll edits preserve attendance');
 assert.equal((await request('/1?month=2026-13')).status,400);assert.equal((await request('/999?month=2026-09')).status,400);
 console.log('PASS payroll: contract base, owner review, weekly eligibility, month boundaries, audit, stale sources, authorization and no attendance mutation');
}finally{server.close();db.close();}
