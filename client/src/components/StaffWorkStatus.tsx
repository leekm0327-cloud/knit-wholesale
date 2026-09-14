import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { errMsg } from '@/lib/format';
import { kstDay } from '@shared/staff-alerts';
const API='/api/staff/work-status';
type Open={id:number;work_date:string;clock_in_at:number;pending:boolean;canSnooze:boolean;snooze:{until_at:number;count:number}|null};
type Data={snoozeMinutes:number;maxSnoozes:number;open:Open[];requests:{id:number;work_date:string;requested_out:number;status:string;decision_memo:string}[]};
export function StaffWorkStatus() {
  const q=useQuery<Data>({queryKey:[API],refetchInterval:60000}),qc=useQueryClient(),{toast}=useToast();
  const [editing,setEditing]=useState<Open|null>(null),[actualDay,setActualDay]=useState(kstDay()),[time,setTime]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
  async function act(path:string,body:unknown) {setBusy(true);try{await apiRequest('POST',API+path,body);await qc.invalidateQueries({queryKey:[API]});setEditing(null);toast({title:path==='/snooze'?`${q.data?.snoozeMinutes}분 뒤 다시 확인할게요.`:'퇴근 수정 요청을 보냈습니다. 소유자 승인 후 반영됩니다.'});}catch(e){toast({title:'처리하지 못했습니다.',description:errMsg(e),variant:'destructive'});}finally{setBusy(false);}}
  if(!q.data) return q.isError?<p role="alert" className="text-sm">근무 확인을 불러오지 못했습니다. <button onClick={()=>q.refetch()}>다시 시도</button></p>:null;
  const rows=q.data.open.filter(r=>r.canSnooze||r.work_date<kstDay()||r.pending);
  return <>{rows.map(r=><section className="s-card mt-3" key={r.id} data-testid="work-status-card"><h3 className="font-semibold">{r.work_date} 퇴근 기록 확인</h3>{r.pending?<p className="mt-2 text-sm">실제 퇴근 시간 승인 대기 중입니다.</p>:<><p className="my-2 text-sm">아직 근무 중이라면 아래에서 알려주세요. 이미 퇴근했다면 실제 시간을 요청해 주세요.</p><div className="flex flex-wrap gap-2">{r.canSnooze&&<button className="s-pill" disabled={busy||(r.snooze?.count??0)>=q.data!.maxSnoozes||(r.snooze?.until_at??0)>Date.now()} onClick={()=>act('/snooze',{day:r.work_date})}>아직 근무 중</button>}<button className="s-pill" onClick={()=>{setEditing(r);setActualDay(r.work_date);setTime('');setReason('');}}>실제 퇴근 시간 요청</button></div>{r.snooze&&<p className="mt-2 text-xs">재알림 {r.snooze.count}/{q.data!.maxSnoozes}회 · {new Date(r.snooze.until_at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})} 이후 확인</p>}</>}
    {editing?.id===r.id&&<form className="mt-3 grid gap-2" onSubmit={e=>{e.preventDefault();void act('/request',{day:r.work_date,actualDay,time,reason});}}><label className="text-sm">실제 퇴근일<input required type="date" aria-label="실제 퇴근일" value={actualDay} onChange={e=>setActualDay(e.target.value)} className="block w-full rounded border p-2"/></label><label className="text-sm">실제 퇴근 시간<input required type="time" aria-label="실제 퇴근 시간" value={time} onChange={e=>setTime(e.target.value)} className="block w-full rounded border p-2"/></label><input required maxLength={1000} aria-label="수정 사유" placeholder="수정 사유" value={reason} onChange={e=>setReason(e.target.value)} className="rounded border p-2"/><div className="flex gap-2"><button disabled={busy} className="s-pill" type="submit">소유자에게 승인 요청</button><button type="button" onClick={()=>setEditing(null)}>닫기</button></div></form>}
  </section>)}{q.data.requests.length>0&&<details className="s-card mt-3"><summary>퇴근 수정 요청 내역</summary>{q.data.requests.map(r=><p className="mt-2 text-sm" key={r.id}>{r.work_date} · {new Date(r.requested_out).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · {{pending:'승인 대기',approved:'반영 완료',rejected:'반려'}[r.status]} {r.decision_memo}</p>)}</details>}</>;
}
