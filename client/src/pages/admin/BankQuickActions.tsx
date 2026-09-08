import { useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
type Row={id:number;deposit:number;withdraw:number;state:string;targetId:number|null;memo:string;posted:number};
export default function BankQuickActions({row,live,customers,categories,onChange,onDetails}:{row:Row;live:boolean;customers:{id:number;name:string}[];categories:{name:string;sector:string}[];onChange:()=>Promise<unknown>;onDetails:()=>void}){
 const [choice,setChoice]=useState(row.state==='customer'?String(row.targetId||''):''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const locked=useRef(false),base=live?'/api/admin/bank-live':'/api/admin/bank-review';
 const expense=row.withdraw>0,allowed=!row.posted&&['pending','customer'].includes(row.state)&&!(row.deposit>0&&row.withdraw>0);
 const run=async(fn:()=>Promise<unknown>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await fn();await onChange();}catch(e:any){setError(e.message||'처리하지 못했습니다.');}finally{locked.current=false;setBusy(false);}};
 const post=()=>run(()=>apiRequest('POST',`${base}/${row.id}/posting`,{kind:expense?'expense':'payment',...(expense?{category:choice,sector:categories.find(x=>x.name===choice)?.sector}:{customerId:Number(choice)}),memo:row.memo,confirmProduction:live}));
 return <div className="bank-quick-actions">
 {allowed&&<><div className="bank-quick-line"><select aria-label={expense?'바로 반영할 비용 항목':'바로 반영할 거래처'} disabled={busy} value={choice} onChange={e=>setChoice(e.target.value)}><option value="">{expense?'비용 항목 선택':'거래처 선택'}</option>{expense?categories.map(x=><option key={x.name} value={x.name}>{x.name}</option>):customers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="bank-quick-primary" disabled={busy||!choice} onClick={post}>{busy?'처리 중…':`${live?'':'테스트 '}${expense?'비용':'수금'} 반영`}</button></div><button className="bank-quick-secondary" disabled={busy} onClick={()=>run(()=>apiRequest('PATCH',`${base}/${row.id}`,{state:expense?'card':'settlement',targetId:null,memo:row.memo}))}>{expense?'카드대금 출금':'매장 정산 입금'}으로 분류</button></>}
 <button className="bank-quick-detail" disabled={busy} onClick={onDetails}>{row.posted?'반영 내역 · 취소':'상세 처리'}</button>{error&&<p role="alert">{error}</p>}
 </div>;
}
