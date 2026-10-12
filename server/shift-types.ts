import type {Express,RequestHandler} from 'express';
import {shiftTypesSchema,defaultShiftTypes,type ShiftType} from '../shared/shift-types';
export function readShiftTypes(db:any):{types:ShiftType[];version:number}{
 if(db.prepare("SELECT name FROM sqlite_master WHERE name='shift_type_settings'").get()){
  const r=db.prepare('SELECT * FROM shift_type_settings WHERE id=1').get();if(r)return {types:shiftTypesSchema.parse(JSON.parse(r.payload)),version:r.version};
 }
 let legacy:any={};if(db.prepare("SELECT name FROM sqlite_master WHERE name='staff_alert_settings'").get()){const r=db.prepare('SELECT config FROM staff_alert_settings WHERE id=1').get();if(r)legacy=JSON.parse(r.config);}
 return {types:defaultShiftTypes.map(t=>({...t,weekday:legacy.weekday?.[t.id==='Close2'?'Close':t.id]||t.weekday,weekend:legacy.weekend?.[t.id==='Close2'?'Close':t.id]||t.weekend})),version:0};
}
export function assertShiftType(db:any,id:string){if(!readShiftTypes(db).types.some(t=>t.id===id&&t.enabled))throw Error('사용 중인 시프트를 선택해 주세요.');}
export function saveShiftTypes(db:any,body:any,actor:number,today=new Date(Date.now()+32400000).toISOString().slice(0,10)){
 const types=shiftTypesSchema.parse(body.types);
 return db.transaction(()=>{
  const old=readShiftTypes(db);if(body.version!==old.version)throw Error('설정이 변경됐습니다. 새로고침 후 다시 저장해 주세요.');
  if(old.types.some(t=>!types.some(n=>n.id===t.id)))throw Error('기존 시프트는 삭제 대신 사용 중지해 주세요.');
  // Preserve past implicit hours before changing defaults; explicit daily exceptions are untouched.
  const cfgRow=db.prepare('SELECT config FROM staff_alert_settings WHERE id=1').get();const holidays=cfgRow?JSON.parse(cfgRow.config).holidays||[]:[];
  for(const s of db.prepare("SELECT * FROM shifts WHERE work_date<? AND (start_time='' OR end_time='')").all(today)){
   const t=old.types.find(t=>t.id===s.position);if(!t)continue;const dow=new Date(s.work_date+'T00:00:00Z').getUTCDay();const h=dow===0||dow===6||holidays.includes(s.work_date)?t.weekend:t.weekday;
   db.prepare('UPDATE shifts SET start_time=?,end_time=? WHERE id=?').run(s.start_time||h.start,s.end_time||h.end,s.id);
  }
  db.prepare('INSERT INTO shift_type_settings(id,payload,version) VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=version+1').run(JSON.stringify(types));
  db.prepare('INSERT INTO shift_type_audit(before_json,after_json,actor,created_at) VALUES(?,?,?,?)').run(JSON.stringify(old.types),JSON.stringify(types),actor,Date.now());
  // Invalidate open alert-setting forms so they cannot overwrite current hours.
  db.prepare('UPDATE staff_alert_settings SET version=version+1 WHERE id=1').run();
  return readShiftTypes(db);
 })();
}
export function registerShiftTypes(app:Express,db:any,auth:{admin:RequestHandler;owner:RequestHandler;staff:RequestHandler}){
 db.exec('CREATE TABLE IF NOT EXISTS shift_type_settings(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,version INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS shift_type_audit(id INTEGER PRIMARY KEY,before_json TEXT NOT NULL,after_json TEXT NOT NULL,actor INTEGER NOT NULL,created_at INTEGER NOT NULL);');
 for(const [url,guard] of [['/api/admin/staff/shift-types',auth.admin],['/api/staff/shift-types',auth.staff]] as const)app.get(url,guard,(_req,res)=>res.json(readShiftTypes(db)));
 app.put('/api/admin/staff/shift-types',auth.owner,(req,res)=>{try{res.json(saveShiftTypes(db,req.body,req.session.userId!));}catch(e:any){res.status(400).json({message:e.issues?.[0]?.message||e.message});}});
}
