import {createHash} from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import {contractSchema,dayDecisionSchema,weekDecisionSchema,monthDecisionSchema,monthSchema,minutesOf,type PayrollContract,type PayrollDay,type PayrollWeek,type PayrollReport} from '../shared/payroll';
import {dayPlus,kstDay,kstStamp,defaultAlertConfig} from '../shared/staff-alerts';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const dow=(d:string)=>new Date(d+'T00:00:00Z').getUTCDay();
const dates=(a:string,b:string)=>{const r:string[]=[];for(let d=a;d<=b;d=dayPlus(d,1))r.push(d);return r;};
const hm=(ts:number|null)=>ts?new Date(ts+9*3600000).toISOString().slice(11,16):'';
const lastDay=(m:string)=>dayPlus(new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5)),1)).toISOString().slice(0,10),-1);
export function initPayroll(db:any){db.exec(`
 CREATE TABLE IF NOT EXISTS payroll_contracts(id INTEGER PRIMARY KEY,staff_id INTEGER NOT NULL,from_date TEXT NOT NULL,to_date TEXT,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS payroll_contract_staff ON payroll_contracts(staff_id,from_date);
 CREATE TABLE IF NOT EXISTS payroll_decisions(staff_id INTEGER NOT NULL,kind TEXT NOT NULL,date_key TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(staff_id,kind,date_key));
 CREATE TABLE IF NOT EXISTS payroll_history(id INTEGER PRIMARY KEY,staff_id INTEGER NOT NULL,kind TEXT NOT NULL,date_key TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,reason TEXT NOT NULL,actor INTEGER NOT NULL,at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS payroll_confirmations(staff_id INTEGER NOT NULL,month TEXT NOT NULL,fingerprint TEXT NOT NULL,snapshot TEXT NOT NULL,actor INTEGER NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(staff_id,month));
 `);}
export function payrollReport(db:any,staffId:number,month:string,now=Date.now()):PayrollReport{
 monthSchema.parse(month);const person=db.prepare('SELECT id,name FROM staff WHERE id=?').get(staffId);if(!person)throw Error('직원을 찾을 수 없습니다.');
 const contracts:PayrollContract[]=db.prepare('SELECT id,payload FROM payroll_contracts WHERE staff_id=? ORDER BY from_date,id').all(staffId).map((r:any)=>({...JSON.parse(r.payload),id:r.id}));
 const at=(d:string)=>contracts.find(c=>c.from<=d&&(!c.to||c.to>=d))||null;
 let holidayConfig=defaultAlertConfig;
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_alert_settings'").get()){const hs=db.prepare('SELECT config FROM staff_alert_settings WHERE id=1').get();if(hs)holidayConfig={...holidayConfig,...JSON.parse(hs.config)};}
 const first=month+'-01',last=lastDay(month),start=dayPlus(first,-34);
 const punches:any[]=db.prepare('SELECT * FROM attendance WHERE staff_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date,id').all(staffId,start,last);
 const shifts:any[]=db.prepare('SELECT * FROM shifts WHERE staff_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date,id').all(staffId,start,last);
 const leaves:any[]=db.prepare("SELECT * FROM leave_requests WHERE staff_id=? AND status='approved' AND start_date<=? AND end_date>=? ORDER BY id").all(staffId,last,start);
 const requests:any[]=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_attendance_requests'").get()?db.prepare("SELECT * FROM staff_attendance_requests WHERE staff_id=? AND work_date BETWEEN ? AND ? AND status='pending' ORDER BY id").all(staffId,start,last):[];
 const decisionRows=db.prepare('SELECT * FROM payroll_decisions WHERE staff_id=? ORDER BY kind,date_key').all(staffId);
 const saved=(kind:string,d:string)=>{const r=decisionRows.find((r:any)=>r.kind===kind&&r.date_key===d);return r?JSON.parse(r.payload):null;};
 const allDays:PayrollDay[]=dates(start,last).map(date=>{
  const c=at(date),sd=c?.days.find(d=>d.weekday===dow(date)),a=punches.filter(p=>p.work_date===date),p=a[0],ss=shifts.filter(s=>s.work_date===date),ll=leaves.filter(l=>l.start_date<=date&&l.end_date>=date);
  const scheduledMinutes=sd?minutesOf(sd.end)-minutesOf(sd.start)-sd.breakMinutes:0;
  const holiday=holidayConfig.holidays.includes(date);
  const fingerprint=hash({c,date,a,ss,ll,holiday,requests:requests.filter(r=>r.work_date===date)}),stored=saved('day',date),decision=stored?.fingerprint===fingerprint?stored:null;
  const issues:string[]=[];
  if(stored&&!decision)issues.push('원본 또는 계약 변경 · 다시 확인');
  if(a.length>1)issues.push('근태 중복');
  if(!c&&(a.length||ss.length))issues.push('계약 미등록');
  if(scheduledMinutes){
   if(!p?.clock_in_at||!p?.clock_out_at)issues.push('출퇴근 기록 확인');
   else{if(p.clock_in_at>kstStamp(date,sd!.start))issues.push('지각 확인');if(p.clock_out_at<kstStamp(date,sd!.end))issues.push('조퇴 확인');if(p.clock_in_at<kstStamp(date,sd!.start)||p.clock_out_at>kstStamp(date,sd!.end))issues.push('계약 밖 체류 · 추가근무 여부 확인');}
   if(sd!.breakMinutes!==Number(p?.break_minutes??sd!.breakMinutes))issues.push('휴게시간 차이');
  }else if(a.length||ss.length)issues.push('계약 근무일 외 기록');
  if(p?.clock_in_at&&p?.clock_out_at&&p.clock_out_at<=p.clock_in_at)issues.push('출퇴근 시간 순서 확인');
  if(c?.workplaceSize==='5plus'&&holiday&&(scheduledMinutes||a.length))issues.push('공휴일 유급·휴일근로수당 확인');
  if(p?.clock_in_at&&p?.clock_out_at&&(hm(p.clock_in_at)<'06:00'||hm(p.clock_out_at)>'22:00'||new Date(p.clock_in_at+9*3600000).toISOString().slice(0,10)!==new Date(p.clock_out_at+9*3600000).toISOString().slice(0,10)))issues.push('야간·날짜 넘김 근무수당 확인');
  if(sd&&((scheduledMinutes>=480&&sd.breakMinutes<60)||(scheduledMinutes>=240&&sd.breakMinutes<30)))issues.push('법정 휴게시간 확인');
  if(ll.length)issues.push('승인 휴가 · 유급시간 확인');
  if(ss.some(s=>!sd||s.start_time!==sd.start||s.end_time!==sd.end))issues.push('근무표와 계약시간 차이');
  const pending=!!issues.length&&!decision;
  const paidMinutes=decision?.paidMinutes??scheduledMinutes,rate=c?.hourlyWage??0;
  return {date,contract:c,scheduledMinutes,paidMinutes,hourlyWage:rate,amount:paidMinutes*rate/60,supplement:(decision?.supplement??0)+(c?.workplaceSize==='5plus'?Math.ceil(Math.max(0,paidMinutes-scheduledMinutes)*rate/120):0),clockIn:hm(p?.clock_in_at),clockOut:hm(p?.clock_out_at),actualMinutes:p?.clock_in_at&&p?.clock_out_at?Math.max(0,Math.floor((p.clock_out_at-p.clock_in_at)/60000)-(p.break_minutes||0)):null,attendance:decision?.attendance??(p?.clock_in_at?'present':'unknown'),issues,pending,fingerprint,decision};
 });
 const weeks:PayrollWeek[]=[];
 for(const date of dates(first,last)){
  const c=at(date);if(!c||dow(date)!==c.holidayWeekday)continue;
  const from=dayPlus(date,-6),window=dates(dayPlus(date,-27),date),weekDays=allDays.filter(d=>d.date>=from&&d.date<date&&d.scheduledMinutes>0);
  const configs=window.map(at),fullWindow=configs.every(Boolean),sameTerms=fullWindow&&configs.every(x=>hash({...x,id:0,from:'',to:null,reason:''})===hash({...c,id:0,from:'',to:null,reason:''}));
  const total=window.reduce((n,d)=>{const t=at(d),s=t?.days.find(x=>x.weekday===dow(d));return n+(s?minutesOf(s.end)-minutesOf(s.start)-s.breakMinutes:0);},0);
  const average=total/4;
  const absent=weekDays.some(d=>d.attendance==='absent'),allLeave=weekDays.length>0&&weekDays.every(d=>d.attendance==='paidLeave'||d.attendance==='excluded');
  const issues:string[]=[];
  if(!sameTerms)issues.push('입·퇴사 또는 4주 내 계약 변경 · 산정 확인');
  if(weekDays.some(d=>d.pending||d.attendance==='unknown'))issues.push('소정근로일 근태 확인 필요');
  if(weekDays.some(d=>d.attendance==='excluded'))issues.push('소정근로일 제외 사유 확인');
  if(allLeave)issues.push('주 전체 휴가·휴업 여부 확인');
  if(!weekDays.length)issues.push('해당 주 소정근로일 확인');
  const suggestedMinutes=average>=900&&!absent&&!allLeave?Math.min(480,total/(4*c.normalDaysPerWeek)):0;
  const fingerprint=hash({date,c,configs,weekDays:weekDays.map(d=>({f:d.fingerprint,decision:d.decision}))});
  const stored=saved('week',date),reviewed=stored?.fingerprint===fingerprint;
  if(stored&&!reviewed)issues.push('근태·계약 변경 · 주휴 재확인');
  const minutes=reviewed?stored.minutes:suggestedMinutes;
  weeks.push({date,from,scheduledAverage:average,suggestedMinutes,minutes,hourlyWage:c.hourlyWage,amount:minutes*c.hourlyWage/60,issues,pending:!!issues.length&&!reviewed,fingerprint,reason:reviewed?stored.reason:'',reviewed:!!reviewed});
 }
 const days=allDays.filter(d=>d.date>=first&&(d.scheduledMinutes||d.clockIn||d.clockOut||d.issues.length||d.decision));
 const basePay=Math.ceil(days.reduce((n,d)=>n+d.amount,0)),weeklyPay=Math.ceil(weeks.reduce((n,w)=>n+w.amount,0)),supplements=days.reduce((n,d)=>n+d.supplement,0);
 const warnings:string[]=[];if(requests.length)warnings.push('퇴근 수정 신청 승인 대기를 먼저 확인해 주세요.');if(!contracts.some(c=>c.from<=last&&(!c.to||c.to>=first)))warnings.push('급여 계약을 먼저 등록해 주세요.');
 const periodContracts=contracts.filter(c=>c.from<=last&&(!c.to||c.to>=first));
 if(periodContracts.some(c=>c.workplaceSize==='unknown'))warnings.push('상시근로자 수 적용 기준을 확인해 주세요.');
 if(periodContracts.some(c=>c.hourlyWage<10320)&&month.startsWith('2026'))warnings.push('2026년 최저시급 10,320원 미만 계약이 있습니다.');
 if(!month.startsWith('2026'))warnings.push('해당 연도 최저임금은 별도 확인이 필요합니다.');
 const endContracts=contracts.filter(c=>c.to&&c.to>=first&&c.to<=last);if(endContracts.length)warnings.push('계약 종료 주의 주휴·미정산 수당을 확인해 주세요.');
 const fingerprint=hash({staffId,month,contracts,days,weeks,holidayConfig});
 const adjustment=saved('month',month),validAdjustment=adjustment?.fingerprint===fingerprint;
 const additions=validAdjustment?adjustment.additions:0,deductions=validAdjustment?adjustment.deductions:0;
 if(adjustment&&!validAdjustment)warnings.push('원본 변경으로 월 추가·공제액을 다시 확인해 주세요.');
 const gross=basePay+weeklyPay+supplements+additions,net=gross-deductions;
 const confirmationFingerprint=hash({fingerprint,adjustment:validAdjustment?adjustment:null});
 const conf=db.prepare('SELECT * FROM payroll_confirmations WHERE staff_id=? AND month=?').get(staffId,month);
 const pending=days.filter(d=>d.pending).length+weeks.filter(w=>w.pending).length;
 return {staffId,name:person.name,month,days,weeks,contracts,basePay,weeklyPay,supplements,additions,deductions,gross,net,pending,warnings,fingerprint,confirmationKey:confirmationFingerprint,monthReason:validAdjustment?adjustment.reason:'',confirmed:!!conf&&conf.fingerprint===confirmationFingerprint,confirmedAt:conf?.at??null,history:db.prepare('SELECT kind,date_key AS key,reason,at,actor FROM payroll_history WHERE staff_id=? ORDER BY id DESC LIMIT 100').all(staffId)};
}
export function registerPayroll(app:Express,db:any,owner:RequestHandler,clock=()=>Date.now()){
 initPayroll(db);
 const wrap=(fn:any):RequestHandler=>(req,res)=>{try{fn(req,res);}catch(e:any){res.status(e.status||400).json({message:e.issues?.[0]?.message||e.message});}};
 const id=(r:any)=>{const n=Number(r.params.id);if(!Number.isSafeInteger(n)||n<=0||!db.prepare('SELECT id FROM staff WHERE id=?').get(n))throw Error('직원을 확인해 주세요.');return n;};
 const audit=(staffId:number,kind:string,key:string,before:any,after:any,reason:string,actor:number)=>db.prepare('INSERT INTO payroll_history(staff_id,kind,date_key,before_json,after_json,reason,actor,at) VALUES(?,?,?,?,?,?,?,?)').run(staffId,kind,key,before?JSON.stringify(before):null,JSON.stringify(after),reason,actor,clock());
 const persist=(staffId:number,kind:string,key:string,data:any,actor:number)=>{
  const prev=db.prepare('SELECT payload FROM payroll_decisions WHERE staff_id=? AND kind=? AND date_key=?').get(staffId,kind,key);
  db.prepare('INSERT OR REPLACE INTO payroll_decisions VALUES(?,?,?,?)').run(staffId,kind,key,JSON.stringify(data));audit(staffId,kind,key,prev?JSON.parse(prev.payload):null,data,data.reason,actor);
 };
 app.get('/api/admin/payroll',owner,wrap((req:any,res:any)=>{res.set('Cache-Control','no-store');res.json(db.prepare('SELECT id,name,position,active FROM staff ORDER BY active DESC,name').all());}));
 app.get('/api/admin/payroll/:id',owner,wrap((req:any,res:any)=>{res.set('Cache-Control','no-store');res.json(payrollReport(db,id(req),monthSchema.parse(req.query.month),clock()));}));
 app.post('/api/admin/payroll/:id/contracts',owner,wrap((req:any,res:any)=>{
  const staffId=id(req),c=contractSchema.parse(req.body);if(c.staffId!==staffId)throw Error('직원이 일치하지 않습니다.');
  const result=db.transaction(()=>{
   const before=c.id?db.prepare('SELECT * FROM payroll_contracts WHERE id=? AND staff_id=?').get(c.id,staffId):null;if(c.id&&!before)throw Error('계약을 찾을 수 없습니다.');
   if(db.prepare("SELECT id FROM payroll_contracts WHERE staff_id=? AND id<>? AND from_date<=? AND coalesce(to_date,'9999-12-31')>=?").get(staffId,c.id||0,c.to||'9999-12-31',c.from))throw Error('계약 기간이 겹칩니다. 이전 계약의 종료일을 먼저 정해 주세요.');
   let contractId=c.id;if(before)db.prepare('UPDATE payroll_contracts SET from_date=?,to_date=?,payload=? WHERE id=?').run(c.from,c.to,JSON.stringify(c),c.id);
   else contractId=Number(db.prepare('INSERT INTO payroll_contracts(staff_id,from_date,to_date,payload) VALUES(?,?,?,?)').run(staffId,c.from,c.to,JSON.stringify(c)).lastInsertRowid);
   audit(staffId,'contract',String(contractId),before?JSON.parse(before.payload):null,c,c.reason,req.session.userId);return contractId;
  })();res.json({id:result});
 }));
 for(const kind of ['day','week','month'] as const)app.post(`/api/admin/payroll/:id/${kind}`,owner,wrap((req:any,res:any)=>{
  const staffId=id(req),body=(kind==='day'?dayDecisionSchema:kind==='week'?weekDecisionSchema:monthDecisionSchema).parse(req.body) as any;
  const month=monthSchema.parse(kind==='month'?body.month:body.date.slice(0,7));
  db.transaction(()=>{
   const report=payrollReport(db,staffId,month,clock());const source=kind==='day'?report.days.find(d=>d.date===body.date):kind==='week'?report.weeks.find(w=>w.date===body.date):report;
   if(!source||source.fingerprint!==body.fingerprint)throw Object.assign(Error('계약·근태가 바뀌었습니다. 새로고침 후 다시 확인해 주세요.'),{status:409});
   if(kind==='day'&&!(source as PayrollDay).contract)throw Error('이 날짜의 계약을 먼저 등록해 주세요.');
   if(kind==='day'&&body.attendance==='absent'&&body.paidMinutes!==0)throw Error('결근으로 분류할 경우 근무급여 시간은 0분으로 입력해 주세요.');
   persist(staffId,kind,kind==='month'?month:body.date,body,req.session.userId);
  })();res.json({ok:true});
 }));
 app.post('/api/admin/payroll/:id/confirm',owner,wrap((req:any,res:any)=>{
  const staffId=id(req),month=monthSchema.parse(req.body.month);
  db.transaction(()=>{
   const r=payrollReport(db,staffId,month,clock());if(req.body.fingerprint!==r.fingerprint||req.body.confirmationKey!==r.confirmationKey)throw Object.assign(Error('계약·근태가 바뀌었습니다. 다시 확인해 주세요.'),{status:409});
   if(lastDay(month)>=kstDay(clock()))throw Error('월말이 지난 뒤 확정할 수 있습니다.');
   if(r.pending)throw Error('일별 예외와 주휴 검토를 먼저 완료해 주세요.');
   if(!r.days.length||!r.contracts.length)throw Error('계약 및 급여 내역이 없습니다.');
   if(req.body.reviewed!==true||typeof req.body.reason!=='string'||!req.body.reason.trim())throw Error('가산수당·유급휴일·공제 확인과 확정 사유가 필요합니다.');
   if(r.net<0)throw Error('공제액이 총 지급액을 초과합니다.');
   if(r.warnings.some(w=>w.includes('미만 계약')||w.includes('다시 확인')||w.includes('적용 기준')||w.includes('승인 대기')))throw Error(r.warnings.join(' '));
   const raw=db.prepare("SELECT payload FROM payroll_decisions WHERE staff_id=? AND kind='month' AND date_key=?").get(staffId,month),a=raw?JSON.parse(raw.payload):null;
   const fingerprint=hash({fingerprint:r.fingerprint,adjustment:a?.fingerprint===r.fingerprint?a:null});
   const before=db.prepare('SELECT snapshot FROM payroll_confirmations WHERE staff_id=? AND month=?').get(staffId,month);
   db.prepare('INSERT OR REPLACE INTO payroll_confirmations VALUES(?,?,?,?,?,?)').run(staffId,month,fingerprint,JSON.stringify(r),req.session.userId,clock());
   audit(staffId,'confirm',month,before?JSON.parse(before.snapshot):null,{gross:r.gross,net:r.net},req.body.reason.trim().slice(0,500),req.session.userId);
  })();res.json({ok:true});
 }));
}
