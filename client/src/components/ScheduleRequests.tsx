import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiRequest,queryClient} from '@/lib/queryClient';
import {useAuth} from '@/lib/auth';
import {useStaff} from '@/components/StaffLayout';
import {SHIFT_SLOTS,slotLabel,type Shift} from '@shared/schema';
import {errMsg} from '@/lib/format';

export function ScheduleRequests({admin=false,shifts=[]}:{admin?:boolean;shifts?:Shift[]}) {
 const {user}=useAuth();const {data:me}=useStaff();
 const allowed=!admin||(user as any)?.adminRole==='owner';
 const url=admin?'/api/admin/staff/schedule-requests':'/api/staff/schedule-requests';
 const {data=[],isError}=useQuery<any[]>({queryKey:[url],enabled:allowed,refetchInterval:30000});
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [form,setForm]=useState({shiftId:0,workDate:'',position:'Open',startTime:'',endTime:'',reason:''});
 const [memos,setMemos]=useState<Record<number,string>>({});
 async function act(method:string,path:string,p?:any){setBusy(true);setError('');try{await apiRequest(method,path,p);await queryClient.invalidateQueries({predicate:q=>String(q.queryKey[0]).includes('/staff/')});setOpen(false);}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
 if(!allowed)return null;
 const pending=data.filter(r=>r.status==='pending');
 return <section className="rounded-lg border p-4 my-4 space-y-3">
  <div className="flex justify-between items-center"><h2 className="font-semibold">스케줄 변경 신청 {pending.length>0?`· 대기 ${pending.length}건`:''}</h2>{!admin&&<button className="border rounded px-3 py-2" onClick={()=>setOpen(!open)}>변경 신청</button>}</div>
  <p className="text-sm text-muted-foreground">소유자가 승인하면 근무표에 반영됩니다. 다른 직원의 근무를 자동으로 교체하지 않습니다.</p>
  {isError&&<p role="alert">신청 목록을 불러오지 못했습니다.</p>}{error&&<p role="alert" className="text-red-600">{error}</p>}
  {open&&!admin&&<form className="grid gap-3" onSubmit={e=>{e.preventDefault();act('POST',url,form);}}>
   <label>변경할 내 근무<select required value={form.shiftId||''} onChange={e=>{const s=shifts.find(s=>s.id===Number(e.target.value));if(s)setForm({...form,shiftId:s.id,workDate:s.workDate,position:s.position,startTime:s.startTime,endTime:s.endTime});}} className="border rounded p-2 w-full"><option value="">근무 선택</option>{shifts.filter(s=>s.staffId===me?.id).map(s=><option key={s.id} value={s.id}>{s.workDate} · {slotLabel(s.position as any)}</option>)}</select></label>
   <label>변경할 날짜<input aria-label="변경할 날짜" type="date" required value={form.workDate} onChange={e=>setForm({...form,workDate:e.target.value})} className="border p-2 block"/></label>
   <label>변경할 조<select value={form.position} onChange={e=>setForm({...form,position:e.target.value})} className="border p-2 ml-2">{SHIFT_SLOTS.map(s=><option key={s} value={s}>{slotLabel(s)}{s==='Close2'?' (두 번째 자리)':''}</option>)}</select></label>
   <div className="flex gap-3"><label>시작<input type="time" required value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})} className="border p-2 block"/></label><label>종료<input type="time" required value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})} className="border p-2 block"/></label></div>
   <label>신청 사유<textarea required maxLength={1000} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} className="border rounded w-full p-2"/></label><button disabled={busy} className="bg-slate-800 text-white rounded p-2">승인 요청</button>
  </form>}
  {pending.length===0&&<p className="text-sm">대기 중인 신청이 없습니다.</p>}
  {(admin?pending:data.filter(r=>r.status==='pending')).map(r=>{const before=JSON.parse(r.before_json),after=JSON.parse(r.after_json);return <div key={r.id} className="border-t pt-3 space-y-2"><b>{r.staff_name}</b><p>{before.work_date} {before.position} {before.start_time}–{before.end_time} → {after.workDate} {after.position} {after.startTime}–{after.endTime}</p><p className="whitespace-pre-wrap">{r.reason}</p>{admin?<><input aria-label={`${r.staff_name} 처리 메모`} placeholder="승인·반려 메모" value={memos[r.id]||''} onChange={e=>setMemos({...memos,[r.id]:e.target.value})} className="border p-2 w-full"/><div className="flex gap-2"><button disabled={busy} className="border rounded p-2" onClick={()=>act('PATCH',`${url}/${r.id}`,{status:'approved',memo:memos[r.id]||''})}>승인하고 근무표 반영</button><button disabled={busy} className="border rounded p-2" onClick={()=>act('PATCH',`${url}/${r.id}`,{status:'rejected',memo:memos[r.id]||''})}>반려</button></div></>:<button disabled={busy} onClick={()=>act('DELETE',`${url}/${r.id}`)}>신청 취소</button>}</div>;})}
  <details><summary>처리 이력</summary>{data.filter(r=>r.status!=='pending').map(r=><p key={r.id} className="py-2">{r.staff_name} · {JSON.parse(r.after_json).workDate} · {({approved:'승인',rejected:'반려',cancelled:'취소'} as any)[r.status]} {r.admin_memo}</p>)}</details>
 </section>;
}

export function ScheduleLeaveNotice({admin=false,from,to,staff}:{admin?:boolean;from:string;to:string;staff:{id:number;name:string}[]}) {
 const {data=[]}=useQuery<{staffId:number;date:string;halfDay:boolean}[]>({queryKey:[`/api/${admin?'admin/':''}staff/leave/days?from=${from}&to=${to}`],refetchInterval:30000});
 if(!data.length)return null;
 return <section className="border rounded p-3 my-3"><h2 className="font-semibold">승인된 연차 · 반차</h2><div className="flex flex-wrap gap-2 mt-2">{data.map(r=><span className="rounded bg-amber-50 p-2 text-sm" key={`${r.staffId}-${r.date}`}>{r.date} · {staff.find(s=>s.id===r.staffId)?.name||'직원'} · {r.halfDay?'반차':'연차'}</span>)}</div></section>;
}
