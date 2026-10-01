import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiRequest,queryClient} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
export function OrderPurchaseCheck({orderId,version}:{orderId:number;version:string}) {
 const path=`/api/admin/orders/${orderId}/purchase-check`;
 const q=useQuery<any>({queryKey:[path,version],queryFn:async()=>{const r=await apiRequest('GET',path);return r.json();}});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
 const p=q.data;
 async function act(action:string) {setBusy(true);setError('');try{await apiRequest('POST',path,{fingerprint:p.fingerprint,action});await q.refetch();queryClient.invalidateQueries({queryKey:['/api/admin/purchases']});setConfirm(false);}catch(e:any){setError(e.message);await q.refetch();}finally{setBusy(false);}}
 if(q.isLoading)return <p className="text-sm">연결된 발주 확인 중…</p>;
 if(q.error)return <p role="alert">발주 상태를 불러오지 못했습니다. <button onClick={()=>q.refetch()}>다시 확인</button></p>;
 if(!p||(p.state==='empty'&&!p.current))return null;
 const names:Record<string,string>={empty:'주문 품목이 없어 기존 발주 확인 필요',matched:'주문·발주 일치',missing:'연결된 발주 없음',changed:'주문과 발주가 달라요',locked:'확정 발주와 변경 내용 확인 필요',cancelled:'취소된 주문의 발주 확인'};
 return <div className="my-5 rounded border p-4 text-sm" data-testid="order-purchase-check">
  <div className="flex flex-wrap justify-between gap-2"><strong>{names[p.state]}{p.locked?' · 확정됨':''}</strong><a href="#/admin/purchases" className="underline">발주 관리</a></div>
  {p.refunds.length>0&&<p className="mt-2 text-amber-800">환불·반품 {p.refunds.length}개 품목은 공장 차감 확인이 필요합니다. 정상 발주 수량만 연결합니다.</p>}
  {!p.managed&&p.current&&<p className="mt-2">기존 발주는 확인 후 연결해야 이후 수정이 함께 반영됩니다.</p>}
  {p.manualChanged&&<p className="mt-2">발주 관리에서 별도로 수정된 내용이 있어 자동으로 바꾸지 않았습니다.</p>}
  <details className="mt-3"><summary className="cursor-pointer">수량·날짜 비교</summary><div className="grid gap-4 py-3 sm:grid-cols-2">{[['현재 발주',p.current],['주문 기준 발주',p.proposed]].map(([title,v]:any)=><div key={title}><b>{title}</b><p>{v?.date??'없음'}</p>{v?.items.map((i:any,n:number)=><p key={n}>{i.name} · {i.qty}개</p>)}<p>공급가 {v?.amount?.toLocaleString()??0}원</p></div>)}</div></details>
  {!p.locked&&p.state!=='cancelled'&&p.state!=='empty'&&<div className="mt-3 flex flex-wrap items-center gap-3"><label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> 수량·실제 발주일·매입단가를 확인했습니다</label>{(!p.managed||p.state!=='matched'||p.manualChanged)&&<Button size="sm" disabled={!confirm||busy} onClick={()=>act('apply')}>{p.current?'확인한 내용으로 발주 연결':'정상 수량 발주 등록'}</Button>}{p.state==='matched'&&<Button size="sm" variant="outline" disabled={!confirm||busy} onClick={()=>act('lock')}>출고·정산 확정 잠금</Button>}</div>}
  {p.locked&&<p className="mt-2">확정된 발주는 자동 수정하지 않습니다. 공장과 확인한 추가·차감은 별도 정산으로 처리해 주세요.</p>}
  {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
 </div>;
}
