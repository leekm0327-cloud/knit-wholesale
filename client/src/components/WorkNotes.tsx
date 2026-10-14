import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {apiRequest} from '@/lib/queryClient';
import {useAuth} from '@/lib/auth';
import {errMsg} from '@/lib/format';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export type WorkNote={staffId:number;date:string;text:string;version:number};
export function useWorkNotes(from:string,to:string){const {user}=useAuth();return useQuery<WorkNote[]>({queryKey:[`/api/admin/payroll/work-notes?from=${from}&to=${to}`],enabled:user?.adminRole==='owner'});}
export default function WorkNotes({staff,notes,target,select,isError=false}:{staff:{id:number;name:string}[];notes:WorkNote[];target:{staffId:number;date:string}|null;select:(v:{staffId:number;date:string}|null)=>void;isError?:boolean}){
 const {user}=useAuth(),qc=useQueryClient(),ref=useRef<HTMLDivElement>(null);
 const today=new Date(Date.now()+32400000).toISOString().slice(0,10);
 const selected=useWorkNotes(target?.date||today,target?.date||today);
 const current=selected.data?.find(n=>n.staffId===target?.staffId&&n.date===target?.date);
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setText(current?.text||'');if(target)ref.current?.scrollIntoView({behavior:'smooth',block:'center'});},[target?.staffId,target?.date,current?.version]);
 useEffect(()=>setMessage(''),[target?.staffId,target?.date]);
 if(user?.adminRole!=='owner')return null;
 async function save(){if(!target)return;setBusy(true);setMessage('');try{await apiRequest('POST',`/api/admin/payroll/${target.staffId}/work-note`,{date:target.date,text,version:current?.version||0});await qc.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith('/api/admin/payroll')});setMessage('메모를 저장했습니다. 급여 정산에서 확인·조정해 주세요.');}catch(e){setMessage(errMsg(e));}finally{setBusy(false);}}
 return <section ref={ref} className="my-4 rounded-lg border p-4 space-y-3"><div className="flex justify-between items-center"><h2 className="font-semibold">근무 메모 · 급여 확인용</h2>{!target&&<Button variant="outline" onClick={()=>select({staffId:staff[0]?.id||0,date:today})}>메모 남기기</Button>}</div><p className="text-sm text-muted-foreground">소유자만 보는 메모입니다. 근무표나 급여 시간은 자동으로 바뀌지 않으며, 월 급여 정산에서 확인할 항목으로 표시됩니다.</p>{isError&&<p role="alert">메모를 불러오지 못했습니다. 새로고침해 주세요.</p>}
 {target&&<fieldset disabled={busy} className="space-y-3"><div className="flex gap-2 flex-wrap"><select aria-label="메모 직원" className="rounded border p-2" value={target.staffId} onChange={e=>select({...target,staffId:Number(e.target.value)})}><option value={0}>직원 선택</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Input aria-label="메모 날짜" type="date" className="w-44" value={target.date} onChange={e=>select({...target,date:e.target.value})}/></div><textarea aria-label="근무 메모" maxLength={2000} className="w-full min-h-24 rounded border p-3 text-sm" value={text} onChange={e=>setText(e.target.value)} placeholder="예: 오늘 12:00~17:00 근무. 휴게시간 30분. 월급 정산 시 추가근무 확인."/><div className="flex gap-2"><Button disabled={!target.staffId||!target.date||selected.isLoading||selected.isError} onClick={save}>메모 저장</Button><Button variant="ghost" onClick={()=>select(null)}>닫기</Button></div></fieldset>}{message&&<p role="status" className="text-sm">{message}</p>}
 {notes.filter(n=>n.text).map(n=><button key={n.staffId+n.date} onClick={()=>select({staffId:n.staffId,date:n.date})} className="block w-full border-t py-2 text-left text-sm"><b>{n.date} · {staff.find(s=>s.id===n.staffId)?.name||'직원'}</b><p className="whitespace-pre-wrap">{n.text}</p></button>)}
 </section>;
}
