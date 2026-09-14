import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/lib/auth';
import {apiRequest} from '@/lib/queryClient';
import {errMsg} from '@/lib/format';
import {Button} from '@/components/ui/button';
const API='/api/admin/staff/attendance-requests';
export default function AttendanceRequests(){
 const {user}=useAuth(),allowed=(user as any)?.adminRole==='owner',qc=useQueryClient();
 const {data,isError}=useQuery<{requests:any[];missing:any[]}>({queryKey:[API],enabled:allowed,refetchInterval:60000});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function decide(id:number,approved:boolean){const memo=approved?'':prompt('반려 사유를 적어주세요.');if(memo===null)return;setBusy(true);setError('');try{await apiRequest('POST',API+'/'+id,{approved,memo});await qc.invalidateQueries({queryKey:[API]});qc.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith('/api/admin/staff/attendance')});}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
 if(!allowed)return null;
 if(isError)return <p role="alert">퇴근 수정 신청을 불러오지 못했습니다.</p>;
 const pending=data?.requests.filter(r=>r.status==='pending')??[];
 return <section className="mb-5 rounded-lg border bg-card p-4 space-y-3"><h2 className="font-semibold">퇴근 미기록 · 수정 승인</h2>{error&&<p role="alert" className="text-red-600">{error}</p>}<p className="text-sm">승인 대기 {pending.length}건 · 전날까지 미퇴근 {data?.missing.length??0}건</p>{pending.map(r=><div className="border-t pt-3" key={r.id}><p className="text-sm">{r.name} · {r.work_date} 근무<br/>실제 퇴근 요청: {new Date(r.requested_out).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}<br/>{r.reason}</p><div className="mt-2 flex gap-2"><Button disabled={busy} onClick={()=>decide(r.id,true)}>승인하고 반영</Button><Button variant="outline" disabled={busy} onClick={()=>decide(r.id,false)}>반려</Button></div></div>)}{!!data?.missing.length&&<details><summary className="cursor-pointer text-sm">퇴근 미기록 목록</summary>{data.missing.map(r=><p className="mt-1 text-sm" key={r.id}>{r.work_date} · {r.name}</p>)}</details>}</section>;
}
