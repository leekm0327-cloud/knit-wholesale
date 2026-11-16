import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/lib/queryClient';
import StaffQueryError from '@/components/StaffQueryError';

const endpoint='/api/staff/bean-orders';
type Item={productId:number;qty:number};
type Product={id:number;name:string;minQty:number};
type Result={configured:boolean;products:Product[];recent:{orderNo:string;status:string;createdAt:number}[]};
const statusLabels:Record<string,string>={pending:'확인 대기',done:'처리완료',cancelled:'취소'};

type Pending={requestId:string;items:Item[]};
function restored(key:string):Pending|null{
  try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value?.requestId&&Array.isArray(value.items)?value:null;}catch{return null;}
}
export default function StaffBeanOrders({staffId}:{staffId:number}){
  const retryKey='knit.staff.bean-order.'+staffId;
  const [initialPending]=useState(()=>restored(retryKey));
  const q=useQuery<Result>({queryKey:[endpoint]});
  const [amounts,setAmounts]=useState<Record<number,string>>(()=>Object.fromEntries((initialPending?.items??[]).map(i=>[i.productId,String(i.qty)])));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [awaitingRetry,setAwaitingRetry]=useState(!!initialPending);
  const lock=useRef(false);
  const pending=useRef<Pending|null>(initialPending);
  const clearPending=()=>{pending.current=null;setAwaitingRetry(false);try{sessionStorage.removeItem(retryKey);}catch{/* unavailable */}};
  const available=q.data?.products??[];
  const items=available.filter(p=>amounts[p.id]&&Number(amounts[p.id])!==0).map(p=>({productId:p.id,qty:Number(amounts[p.id])}));
  const adjust=(productId:number,delta:number)=>setAmounts(old=>{
    const current=Number(old[productId]);
    const next=Math.max(0,Math.min(1000,(Number.isSafeInteger(current)?current:0)+delta));
    return {...old,[productId]:next===0?'':String(next)};
  });
  const valid=items.every(i=>Number.isSafeInteger(i.qty)&&i.qty>=Math.max(1,available.find(p=>p.id===i.productId)?.minQty??1)&&i.qty<=1000);
  const qty=items.reduce((sum,item)=>sum+item.qty,0);
  async function send(){
    if(lock.current||(!pending.current&&(!valid||qty<5||!q.data?.configured)))return;
    if(!pending.current&&!window.confirm('매장 원두 주문을 접수할까요? 일반 도매 주문처럼 관리자가 확인한 뒤 처리합니다.'))return;
    lock.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      pending.current??={requestId:crypto.randomUUID(),items};
      try{sessionStorage.setItem(retryKey,JSON.stringify(pending.current));}catch{/* unavailable */}
      const r=await apiRequest('POST',endpoint,pending.current);
      const order=await r.json();
      clearPending();setAmounts({});setNotice(order.orderNo+' 주문이 접수되었습니다. 관리자 확인 대기 중입니다.');
      void q.refetch();
    }catch(e){
      const msg=e instanceof Error?e.message:'주문 결과를 확인하지 못했습니다.';
      if(/^(400|409):/.test(msg)){
        clearPending();const detail=msg.replace(/^\d+:\s*/,'');
        try{setError(JSON.parse(detail).message||detail);}catch{setError(detail);}
        void q.refetch();
      }else{
        setAwaitingRetry(!!pending.current);
        setError('주문 결과를 확인하지 못했습니다. 같은 주문 다시 확인을 눌러 주세요.');
      }
    }finally{lock.current=false;setBusy(false);}
  }
  return <section className="s-card"><h2 className="text-base font-semibold">매장 원두 주문</h2>
    <p className="s-label mt-2">매장 내부 계정으로 접수합니다. 관리자가 확인한 뒤 일반 도매 주문과 같은 출고 절차를 진행합니다.</p>
    {q.isError?<StaffQueryError retry={q.refetch}/>:q.isLoading?<p>불러오는 중…</p>:(!q.data?.configured&&!awaitingRetry)?<p role="status">관리자가 배송지와 연락처가 있는 매장 내부 계정 한 곳을 설정하면 주문할 수 있습니다.</p>:<form onSubmit={e=>{e.preventDefault();void send();}}>
      <p className="s-label mt-3">품목별 포장 단위 기준 · 합계 최소 5개</p>
      {available.length===0&&<p>현재 주문 가능한 원두가 없습니다.</p>}
      {available.map(p=><div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center py-2 border-b border-[var(--s-hair)]">
        <label htmlFor={`bean-order-qty-${p.id}`}>{p.name}{p.minQty>1&&<small className="block">최소 {p.minQty}개</small>}</label>
        <div className="flex items-center gap-1">
          <button className="s-pill line !px-0 w-10 h-11" type="button" aria-label={p.name+' 수량 줄이기'} onClick={()=>adjust(p.id,-1)} disabled={busy||awaitingRetry||!(Number(amounts[p.id])>0)}>−</button>
          <input id={`bean-order-qty-${p.id}`} className="s-input !px-1 w-[50px] h-11 text-center" type="number" min={0} max={1000} step={1} inputMode="numeric" aria-label={p.name+' 수량'} placeholder="0" value={amounts[p.id]??''} disabled={busy||awaitingRetry} onChange={e=>{const value=e.target.value;setAmounts(old=>({...old,[p.id]:value}));}}/>
          <button className="s-pill line !px-0 w-10 h-11" type="button" aria-label={p.name+' 수량 늘리기'} onClick={()=>adjust(p.id,1)} disabled={busy||awaitingRetry||Number(amounts[p.id])>=1000}>+</button>
        </div>
      </div>)}
      <div className="flex items-center justify-between my-3" aria-live="polite"><strong>합계 {Number.isFinite(qty)?qty:0}개</strong><small>{qty>=5&&valid?'주문 가능':'합계 5개와 품목별 최소 수량을 확인해 주세요.'}</small></div>
      {error&&<p role="alert" className="text-sm my-2">{error}</p>}
      {notice&&<p role="status" className="text-sm my-2">{notice}</p>}
      <button className="s-pill" type="submit" disabled={busy||(!awaitingRetry&&(!valid||qty<5))}>{busy?'접수 중…':awaitingRetry?'같은 주문 다시 확인':`주문 접수 (${qty}개)`}</button>
    </form>}
    {!!q.data?.recent.length&&<div className="mt-4"><h3 className="font-semibold">내 최근 원두 주문</h3><ul>{q.data.recent.map(o=><li key={o.orderNo} className="text-sm">{o.orderNo} · {statusLabels[o.status]??o.status}</li>)}</ul></div>}
  </section>;
}
