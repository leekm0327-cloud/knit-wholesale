import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/lib/auth';
import {apiRequest} from '@/lib/queryClient';
import {errMsg} from '@/lib/format';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {effectiveHours,type AlertConfig} from '@shared/staff-alerts';
import type {Shift,PublicStaff} from '@shared/schema';
export default function ShiftHoursEditor({shifts,staff}:{shifts:Shift[];staff:PublicStaff[]}){
 const {user}=useAuth(),qc=useQueryClient(),{data}=useQuery<AlertConfig>({queryKey:['/api/admin/staff/shift-hours']});
 const [id,setId]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 if((user as any)?.adminRole!=='owner')return null;
 const row=shifts.find(s=>String(s.id)===id);
 const hours=row&&data?effectiveHours(data,row):null;
 async function save(reset=false){if(!row)return;setBusy(true);try{await apiRequest('PUT','/api/admin/staff/shift-hours/'+row.id,{start:reset?'':start,end:reset?'':end});await qc.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith('/api/admin/staff/shifts')});setMsg('근무 시간과 알림 기준을 변경했습니다.');}catch(e){setMsg(errMsg(e));}finally{setBusy(false);}}
 return <details className="my-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">근무 시간 변경 · 알림 설정</summary><p className="my-3 text-sm">조별 기본 시간은 <a className="underline" href="#/admin/alimtalk">알림톡 → 직원 · 발주 알림</a>에서 조절할 수 있습니다. 특정 날짜만 다른 시간으로 근무하면 아래에서 변경해 주세요.</p><div className="flex flex-wrap gap-2"><select aria-label="시간을 바꿀 근무" className="max-w-full rounded border bg-background p-2" value={id} onChange={e=>{setId(e.target.value);const s=shifts.find(s=>String(s.id)===e.target.value);const h=s&&data?effectiveHours(data,s):null;setStart(h?.start??'');setEnd(h?.end??'');setMsg('');}}><option value="">근무 선택</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.workDate} · {staff.find(p=>p.id===s.staffId)?.name} · {s.position}</option>)}</select><Input aria-label="개별 근무 시작" className="w-36" type="time" value={start} onChange={e=>setStart(e.target.value)}/><Input aria-label="개별 근무 종료" className="w-36" type="time" value={end} onChange={e=>setEnd(e.target.value)}/><Button disabled={!row||busy} onClick={()=>save()}>시간 저장</Button><Button disabled={!row||busy} variant="outline" onClick={()=>save(true)}>조별 기본 시간 사용</Button></div>{hours&&<p className="mt-2 text-sm">현재 적용: {hours.start}–{hours.end}</p>}{msg&&<p role="status" className="mt-2 text-sm">{msg}</p>}</details>;
}
