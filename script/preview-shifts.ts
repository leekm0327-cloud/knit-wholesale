// Fictional in-memory preview. No production data or message provider.
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {registerShiftTypes} from '../server/shift-types';
import {initStaffAlerts,readAlertState} from '../server/staff-alerts';
const db:any=new DatabaseSync(':memory:');db.transaction=(f:any)=>()=>{db.exec('BEGIN');try{const r=f();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec('CREATE TABLE shifts(id INTEGER PRIMARY KEY,work_date TEXT,position TEXT,start_time TEXT,end_time TEXT)');initStaffAlerts(db);
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:1,role:'admin',adminRole:'owner'};next();});
const guard:any=(_q:any,_r:any,next:any)=>next();registerShiftTypes(app,db,{admin:guard,staff:guard,owner:guard});
app.get('/api/auth/me',(_q,r)=>r.json({id:1,role:'admin',adminRole:'owner',managerName:'미리보기',businessName:'니트커피'}));
app.get('/api/admin/staff/shifts',(q,r)=>r.json({shifts:[],staff:[{id:1,name:'예시 직원',active:1}],from:q.query.from,to:q.query.to}));
app.get('/api/admin/staff/shift-hours',(_q,r)=>r.json(readAlertState(db).config));
app.use('/api',(_q,r)=>r.json([]));const dir=resolve('dist/public');
app.get('/',(_q,r)=>r.type('html').send(readFileSync(resolve(dir,'index.html'),'utf8').replace('<body>','<body><div style="position:sticky;top:0;z-index:99999;background:#e9d5a4;padding:8px;text-align:center">시프트 설정 미리보기 · 가상 데이터 · 운영 사이트에는 반영되지 않습니다</div>')));
app.use(express.static(dir));app.listen(8773,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8773/#/admin/staff/schedule'));
