import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v+'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0,10) === v; }, '날짜를 확인해 주세요.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const proposal = z.object({shiftId:z.number().int().positive(),workDate:day,position:z.enum(['Open','Baker','Close','Close2','Part']),startTime:time,endTime:time,reason:z.string().trim().min(1).max(1000)}).refine(p=>p.startTime<p.endTime,'종료 시간은 시작 시간 이후여야 합니다.');
const today = () => new Date(Date.now()+9*3600000).toISOString().slice(0,10);
export function initScheduleApproval(db:Database.Database) {
 db.exec(`CREATE TABLE IF NOT EXISTS schedule_change_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,staff_id INTEGER NOT NULL,staff_name TEXT NOT NULL,shift_id INTEGER NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',decided_by TEXT NOT NULL DEFAULT '',admin_memo TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,decided_at INTEGER);
 CREATE UNIQUE INDEX IF NOT EXISTS schedule_pending_shift ON schedule_change_requests(shift_id) WHERE status='pending';
 CREATE TABLE IF NOT EXISTS leave_schedule_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,leave_id INTEGER NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at INTEGER NOT NULL);`);
}
export function assertNoLeave(db:Database.Database,staffId:number,date:string) {
 if(db.prepare("SELECT id FROM leave_requests WHERE staff_id=? AND status='approved' AND half_day=0 AND start_date<=? AND end_date>=?").get(staffId,date,date)) throw Error('승인된 종일 연차가 있는 날에는 근무를 배정할 수 없습니다.');
}
export function decideSchedule(db:Database.Database,id:number,status:'approved'|'rejected',actor:string,memo:string) {
 return db.transaction(()=>{
  const r:any=db.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(id);
  if(!r || r.status!=='pending') throw Error('대기 중인 신청이 아닙니다. 새로고침해 주세요.');
  if(status==='approved') {
   const old=JSON.parse(r.before_json), p=JSON.parse(r.after_json);
   const current:any=db.prepare('SELECT * FROM shifts WHERE id=?').get(r.shift_id);
   if(!current || JSON.stringify(current)!==JSON.stringify(old)) throw Error('신청 후 근무표가 변경됐습니다. 직원에게 다시 신청하도록 안내해 주세요.');
   if(current.work_date<today() || p.workDate<today()) throw Error('지난 근무는 변경 신청으로 수정할 수 없습니다.');
   if(db.prepare('SELECT id FROM attendance WHERE staff_id=? AND work_date IN (?,?) AND clock_in_at IS NOT NULL').get(r.staff_id,current.work_date,p.workDate)) throw Error('이미 출근한 날의 근무는 변경할 수 없습니다.');
   assertNoLeave(db,r.staff_id,p.workDate);
   if(db.prepare("SELECT id FROM leave_requests WHERE staff_id=? AND status='approved' AND half_day=1 AND start_date<=? AND end_date>=?").get(r.staff_id,p.workDate,p.workDate)) throw Error('반차 승인일은 소유자가 근무시간을 직접 조정해 주세요.');
   if(db.prepare('SELECT id FROM shifts WHERE id<>? AND work_date=? AND (position=? OR staff_id=?)').get(r.shift_id,p.workDate,p.position,r.staff_id)) throw Error('해당 조에 다른 직원이 배정되어 있거나 본인의 다른 근무와 겹칩니다. 근무표를 먼저 조정해 주세요.');
   db.prepare('UPDATE shifts SET work_date=?,position=?,start_time=?,end_time=? WHERE id=?').run(p.workDate,p.position,p.startTime,p.endTime,r.shift_id);
  }
  db.prepare('UPDATE schedule_change_requests SET status=?,decided_by=?,admin_memo=?,decided_at=? WHERE id=?').run(status,actor,memo,Date.now(),id);
  return db.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(id);
 })();
}
export function applyLeaveDecision(db:Database.Database,id:number,status:'approved'|'rejected',actor:string,memo:string,remaining?:{startTime:string,endTime:string}) {
 return db.transaction(()=>{
  const r:any=db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id);
  if(!r || r.status!=='pending') throw Error('이미 처리됐거나 없는 신청입니다.');
  if(status==='approved') {
   if(db.prepare("SELECT id FROM leave_requests WHERE id<>? AND staff_id=? AND status='approved' AND start_date<=? AND end_date>=?").get(id,r.staff_id,r.end_date,r.start_date)) throw Error('이미 승인된 연차와 기간이 겹칩니다.');
   const rows:any[]=db.prepare('SELECT * FROM shifts WHERE staff_id=? AND work_date BETWEEN ? AND ?').all(r.staff_id,r.start_date,r.end_date);
   if(r.half_day && (r.start_date!==r.end_date || rows.length!==1 || !remaining || !time.safeParse(remaining.startTime).success || !time.safeParse(remaining.endTime).success || remaining.startTime>=remaining.endTime)) throw Error('반차는 해당 날짜에 근무 한 건을 배정하고, 남은 근무 시작·종료 시간을 입력해 주세요.');
   if(rows.some(s=>s.work_date<today()) || db.prepare('SELECT id FROM attendance WHERE staff_id=? AND work_date BETWEEN ? AND ? AND clock_in_at IS NOT NULL').get(r.staff_id,r.start_date,r.end_date)) throw Error('이미 근무했거나 출근한 날짜가 포함되어 있습니다. 근태를 먼저 확인해 주세요.');
   for(const s of rows) {
    if(r.half_day) db.prepare('UPDATE shifts SET start_time=?,end_time=? WHERE id=?').run(remaining!.startTime,remaining!.endTime,s.id);
    else db.prepare('DELETE FROM shifts WHERE id=?').run(s.id);
   }
   db.prepare('INSERT INTO leave_schedule_audit(leave_id,before_json,after_json,created_at) VALUES(?,?,?,?)').run(id,JSON.stringify(rows),JSON.stringify(r.half_day?remaining:[]),Date.now());
  }
  db.prepare('UPDATE leave_requests SET status=?,decided_by_name=?,decided_at=?,admin_memo=? WHERE id=?').run(status,actor,Date.now(),memo,id);
 })();
}
export function registerScheduleApproval(app:Express,db:Database.Database,staffAuth:RequestHandler,ownerAuth:RequestHandler,notify:(r:any)=>Promise<any>) {
 initScheduleApproval(db);
 app.get('/api/staff/schedule-requests',staffAuth,(req,res)=>res.json(db.prepare('SELECT * FROM schedule_change_requests WHERE staff_id=? ORDER BY id DESC LIMIT 100').all(req.session.staffId)));
 app.post('/api/staff/schedule-requests',staffAuth,async(req,res)=>{try{
  const p=proposal.parse(req.body);
  const me:any=db.prepare('SELECT id,name FROM staff WHERE id=? AND active=1').get(req.session.staffId);
  const shift:any=db.prepare('SELECT * FROM shifts WHERE id=? AND staff_id=?').get(p.shiftId,me?.id||0);
  if(!shift) throw Error('본인에게 배정된 근무만 변경 신청할 수 있습니다.');
  if(shift.work_date<today()||p.workDate<today()) throw Error('오늘 이후의 근무를 선택해 주세요.');
  if(db.prepare("SELECT id FROM schedule_change_requests WHERE shift_id=? AND status='pending'").get(p.shiftId)) throw Error('이 근무는 이미 변경 신청 중입니다.');
  const id=db.prepare('INSERT INTO schedule_change_requests(staff_id,staff_name,shift_id,before_json,after_json,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(me.id,me.name,p.shiftId,JSON.stringify(shift),JSON.stringify(p),p.reason,Date.now()).lastInsertRowid;
  await notify({type:'staff_leave',title:`스케줄 변경 신청 · ${me.name}`,body:`${shift.work_date} ${shift.position} → ${p.workDate} ${p.position} ${p.startTime}–${p.endTime}`,link:'/admin/staff/schedule'}).catch(()=>{});
  res.json({id});
 }catch(e){res.status(400).json({message:e instanceof z.ZodError?'입력한 날짜·시간·사유를 확인해 주세요.':(e as Error).message});}});
 app.delete('/api/staff/schedule-requests/:id',staffAuth,(req,res)=>{
  const result=db.prepare("UPDATE schedule_change_requests SET status='cancelled',decided_at=? WHERE id=? AND staff_id=? AND status='pending'").run(Date.now(),Number(req.params.id),req.session.staffId);
  res.status(result.changes?200:409).json({message:result.changes?'취소했습니다.':'대기 중인 본인 신청만 취소할 수 있습니다.'});
 });
 app.get('/api/admin/staff/schedule-requests',ownerAuth,(_req,res)=>res.json(db.prepare('SELECT * FROM schedule_change_requests ORDER BY id DESC LIMIT 200').all()));
 app.patch('/api/admin/staff/schedule-requests/:id',ownerAuth,(req,res)=>{try{
  const p=z.object({status:z.enum(['approved','rejected']),memo:z.string().max(1000).default('')}).parse(req.body);
  res.json(decideSchedule(db,Number(req.params.id),p.status,`owner:${req.session.userId}`,p.memo));
 }catch(e){res.status(409).json({message:e instanceof z.ZodError?'입력값을 확인해 주세요.':(e as Error).message});}});
}
