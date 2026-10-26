import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import BankSettlementBulk from './BankSettlementBulk';

type Candidate={bankId:number;account:string;remark:string;token:string};
type Rule={id:number;account:string;remark:string;enabled:boolean;version:number;effectiveAt:string;blocked:boolean};
type History={id:number;bankId:number;ruleId:number;version:number;remark:string;at:number;endedAt:number|null;reason:string|null};
type Data={candidates:Candidate[];rules:Rule[];history:History[];changes:{id:number;ruleId:number;version:number;action:string;at:number}[]};
export default function BankSettlementRules({base,onChange}:{base:string;onChange:()=>Promise<unknown>}) {
 const q=useQuery<Data>({queryKey:[base+'/settlement-rules'],staleTime:0});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<Rule|null>(null),[checked,setChecked]=useState(false),[undo,setUndo]=useState<number|null>(null),[reason,setReason]=useState('');
 const lock=useRef(false);
 async function run(fn:()=>Promise<unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();setConfirm(null);setChecked(false);setUndo(null);setReason('');await q.refetch();await onChange();}catch(e:any){setError(e.message||'처리하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}
 const openConfirm=(value:Rule)=>{setConfirm(value);setChecked(false);setError('');};
 const button='border px-3 py-2 min-h-11 text-sm disabled:opacity-50';
 const confirmationPanel=confirm&&<div data-testid="rule-confirmation" className="bg-muted p-3 my-2 basis-full w-full"><p className="break-all">{confirm.account} · 입금 · {confirm.remark}</p><label className="flex items-start gap-2 py-3"><input className="mt-1" type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>이 적요가 매장 카드 정산 입금임을 확인했습니다. 이후 신규 내역에 적용합니다.</label><div className="flex flex-wrap gap-2"><button className={button} disabled={busy||!checked} onClick={()=>run(()=> apiRequest('PATCH',`${base}/settlement-rules/${confirm.id}`,{version:confirm.version,enabled:true,confirmCardSettlement:true}))}>확인 후 활성화</button><button className={button} disabled={busy} onClick={()=>{setConfirm(null);setChecked(false);setError('');}}>닫기</button></div></div>;
 return <details className="border-y py-3 my-4 text-sm" data-testid="settlement-rules"><summary className="cursor-pointer py-2">카드 정산 자동 분류 · 활성 {q.data?.rules.filter(r=>r.enabled).length??0} · 후보 {q.data?.candidates.length??0}</summary>
 <p className="text-muted-foreground my-2">같은 계좌 · 입금 · 적요 완전일치. 확인한 규칙으로 신규 내역을 분류합니다. 기존 미처리는 기간과 대상을 확인한 뒤 적용하며 매출은 추가하지 않습니다.</p>
 {q.isLoading&&<p role="status">규칙 확인 중…</p>}{q.isError&&<p role="alert">규칙을 불러오지 못했습니다. <button className={button} onClick={()=>q.refetch()}>다시 시도</button></p>}{error&&<p role="alert" className="my-2">{error}</p>}
 {q.data?.rules.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><div className="min-w-0 break-all">{r.remark} <span className="text-muted-foreground">{r.account} · v{r.version} · {r.enabled?'활성':'중지'}{r.blocked?' · 충돌: 수동 검토':''}</span></div><button className={button} disabled={busy} onClick={()=>r.enabled?void run(()=>apiRequest('PATCH',`${base}/settlement-rules/${r.id}`,{version:r.version,enabled:false})):openConfirm(r)}>{r.enabled?'중지':'다시 활성화'}</button>{confirm && confirm.id===r.id && confirmationPanel}</div>)}
 {q.data&&<BankSettlementBulk base={base} candidates={[...q.data.candidates,...q.data.rules.filter(r=>r.enabled&&!r.blocked).map(r=>({bankId:-r.id,account:r.account,remark:r.remark,token:String(r.version)}))]} onChange={async()=>{await q.refetch();await onChange();}}/>}
 {q.data&&!q.data.rules.length&&!q.data.candidates.length&&<p className="py-2">확인 가능한 매장 정산 규칙 후보가 없습니다.</p>}

 <details className="mt-2"><summary className="cursor-pointer py-2">분류 · 규칙 이력 (최근 100건씩)</summary>{q.data?.history.map(h=><div key={h.id} className="flex flex-wrap justify-between items-center gap-2 border-t py-2"><span className="min-w-0 break-all">{new Date(h.at).toLocaleString('ko-KR')} · {h.remark} · 규칙 #{h.ruleId} v{h.version}{h.endedAt?' · 해제됨':''}</span>{!h.endedAt&&<button className={button} disabled={busy} onClick={()=>{setUndo(h.id);setReason('');}}>되돌리기</button>}</div>)}{undo!==null&&<div className="py-2"><label className="block">되돌리는 이유<input className="border p-2 w-full my-2" value={reason} maxLength={200} onChange={e=>setReason(e.target.value)}/></label><p className="my-2">미확인으로 되돌리고 이 거래는 재적용하지 않습니다.</p><button className={button} disabled={busy||!reason.trim()} onClick={()=>run(()=>apiRequest('POST',`${base}/settlement-rules/history/${undo}/undo`,{reason}))}>분류 되돌리기</button> <button className={button} disabled={busy} onClick={()=>setUndo(null)}>취소</button></div>}{q.data?.changes.map(c=><p className="py-1 text-muted-foreground" key={c.id}>{new Date(c.at).toLocaleString('ko-KR')} · 규칙 #{c.ruleId} v{c.version} · {c.action==='enable'?'활성화':'중지'}</p>)}</details>
 </details>;
}
