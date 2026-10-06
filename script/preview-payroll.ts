// Local-only fictional preview. No real database, jobs, credentials or message providers.
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {registerPayroll} from '../server/payroll';
import {dayPlus,kstStamp} from '../shared/staff-alerts';
const db:any=new DatabaseSync(':memory:');
db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec(`CREATE TABLE staff(id INTEGER PRIMARY KEY,name TEXT,position TEXT,active INTEGER);INSERT INTO staff VALUES(1,'예시 파트타이머','Part',1);
CREATE TABLE attendance(id INTEGER PRIMARY KEY,staff_id INTEGER,work_date TEXT,clock_in_at INTEGER,clock_out_at INTEGER,break_minutes INTEGER);
CREATE TABLE shifts(id INTEGER PRIMARY KEY,staff_id INTEGER,work_date TEXT,start_time TEXT,end_time TEXT);
CREATE TABLE leave_requests(id INTEGER PRIMARY KEY,staff_id INTEGER,start_date TEXT,end_date TEXT,status TEXT);`);
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:1,role:'admin',adminRole:'owner'};next();});
registerPayroll(app,db,(_req,_res,next)=>next());
const c={staffId:1,from:'2026-08-01',to:null,hourlyWage:12000,days:[1,2,3,4,5].map(weekday=>({weekday,start:'11:30',end:'14:30',breakMinutes:0})),holidayWeekday:0,normalDaysPerWeek:5,workplaceSize:'under5',reason:'미리보기용 가상 계약'};
db.prepare('INSERT INTO payroll_contracts(staff_id,from_date,to_date,payload) VALUES(1,?,NULL,?)').run(c.from,JSON.stringify(c));
for(let d='2026-08-01';d<='2026-09-30';d=dayPlus(d,1)){if([0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()))continue;db.prepare('INSERT INTO attendance(staff_id,work_date,clock_in_at,clock_out_at,break_minutes) VALUES(1,?,?,?,0)').run(d,kstStamp(d,d==='2026-09-01'?'11:15':'11:30'),kstStamp(d,d==='2026-09-01'?'14:40':'14:30'));}
app.get('/api/auth/me',(_req,res)=>res.json({id:1,role:'admin',adminRole:'owner',managerName:'미리보기',businessName:'니트커피'}));
app.get('/api/admin/staff/attendance',(_req,res)=>res.json({rows:[],summary:[],staff:[],from:'2026-09-01',to:'2026-09-30'}));
app.get('/api/admin/staff/attendance-requests',(_req,res)=>res.json({requests:[],missing:[]}));
app.use('/api',(_req,res)=>res.json([]));
const dir=resolve('dist/public');
app.get('/',(_req,res)=>res.type('html').send(readFileSync(resolve(dir,'index.html'),'utf8').replace('<body>','<body><div style="position:sticky;top:0;z-index:99999;background:#e9d5a4;color:#29271f;text-align:center;padding:8px;font:13px sans-serif">급여 미리보기 · 가상 직원·가상 시급 · 2026년 9월과 예시 직원을 선택해 주세요</div>')));
app.use(express.static(dir));app.listen(8772,'127.0.0.1',()=>console.log('http://127.0.0.1:8772/#/admin/staff/attendance'));
