import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
const currency=(n:number)=>n.toLocaleString('ko-KR')+'원';
type Posting={id:number;kind:string;amount:number;customer_id:number|null;category:string|null;sector:string|null;memo:string;cancelled_at:number|null;cancel_reason:string|null};
export function TestLedgerSummary({live=false}:{live?:boolean}){
 const q=useQuery<{expenses:{category:string;sector:string;amount:number;count:number}[];payments:{customerId:number;name:string;amount:number;count:number}[]}>({queryKey:[live?'/api/admin/bank-live-ledger':'/api/admin/bank-test-ledger'],staleTime:0});
 if(q.isError)return <p role="alert">테스트 장부 요약을 불러오지 못했습니다.</p>;
 return <section className="border rounded p-4 my-4"><h2 className="font-semibold">{live?'운영 장부 반영 현황':'테스트 장부 반영 현황'}</h2><p className="text-sm text-gray-600">{live?'이 화면에서 반영한 비용·수금입니다.':'운영 재무제표·거래처 잔액에는 포함되지 않습니다.'}</p>{q.isLoading?<p>불러오는 중…</p>:<div className="grid md:grid-cols-2 gap-4 mt-3"><div><h3>추가 비용</h3>{q.data?.expenses.map((x,i)=><p key={i}>{x.category} · {x.sector} · {currency(x.amount)} ({x.count}건)</p>)}{!q.data?.expenses.length&&<p>없음</p>}</div><div><h3>{live?'거래처별 수금 반영액':'거래처별 미수금 차감 예정액'}</h3>{q.data?.payments.map(x=><p key={x.customerId}>{x.name} · −{currency(x.amount)} ({x.count}건)</p>)}{!q.data?.payments.length&&<p>없음</p>}</div></div>}</section>;
}
export default function BankPosting({row,customers,onChange,live=false}:{live?:boolean;row:{id:number;deposit:number;withdraw:number;state:string;targetId:number|null};customers:{id:number;name:string}[];onChange:()=>Promise<unknown>}){
 const base=live?'/api/admin/bank-live':'/api/admin/bank-review';
 const [confirmed,setConfirmed]=useState(false);
 const [customer,setCustomer]=useState(row.state==='customer'?String(row.targetId||''):''),[category,setCategory]=useState(''),[sector,setSector]=useState(''),[memo,setMemo]=useState(''),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reason,setReason]=useState('');
 const q=useQuery<{history:Posting[];categories:{name:string;sector:string}[]}>({queryKey:[`${base}/${row.id}/posting`],staleTime:0});
 const active=q.data?.history.find(x=>!x.cancelled_at),expense=row.withdraw>0;
 const allowed=!['expense','payment','transfer','card','loan','settlement','other'].includes(row.state)&&(expense||row.state==='customer')&&!(row.deposit>0&&row.withdraw>0);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await q.refetch();await onChange();setChecked(false);}catch(e:any){setError(e.message||'처리하지 못했습니다.');}finally{setBusy(false);}};
 return <section className="border-t mt-5 pt-4"><h3 className="font-semibold">{live?'운영 장부 반영':'장부 반영 테스트'}</h3>{q.isLoading?<p>반영 기록 확인 중…</p>:q.isError?<p role="alert">반영 기록을 불러오지 못했습니다. <button onClick={()=>q.refetch()}>다시 시도</button></p>:<>
 {active?<div><p className="my-3">{live?'장부 반영 완료':'테스트 반영 완료'} · {currency(active.amount)} · {active.kind==='expense'?active.category:customers.find(c=>c.id===active.customer_id)?.name||'거래처 수금'}</p><input className="border p-2" aria-label="반영 취소 사유" placeholder="취소 사유" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/><button className="border p-2 ml-2" disabled={busy||!reason.trim()} onClick={()=>run(()=>apiRequest('POST',`${base}/${row.id}/posting/${active.id}/cancel`,{reason}))}>{live?'운영 반영 취소':'테스트 반영 취소'}</button></div>:!allowed?<p className="my-3">현재 분류는 비용·수금을 새로 생성하지 않습니다. 거래처 수금은 위에서 거래처 입금으로 분류하고 저장해 주세요.</p>:<>
 <p className="my-3">{expense?'비용 추가':live?'미수금 차감':'미수금 차감 예정'} <strong>{currency(expense?row.withdraw:row.deposit)}</strong></p>
 <div className="flex flex-wrap gap-3">{expense?<><select aria-label="비용 항목" value={category} onChange={e=>{setCategory(e.target.value);setSector(q.data?.categories.find(x=>x.name===e.target.value)?.sector||'common');}}><option value="">비용 항목 선택</option>{q.data?.categories.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select><select aria-label="사업 부문" value={sector} onChange={e=>setSector(e.target.value)}><option value="">부문 선택</option>{Object.entries({store:'매장',wholesale:'도매',online:'온라인',atelier:'아뜰리에',consulting:'컨설팅',popup:'팝업',common:'공통'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></>:<select aria-label="수금 반영 거래처" value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">거래처 선택</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
 <input className="border p-2 w-full my-3" aria-label="장부 메모" placeholder="장부 메모" value={memo} maxLength={500} onChange={e=>setMemo(e.target.value)} />
 <label className="block text-sm my-3"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/> 기존 비용·수금에 이미 기록된 내역이 아닌지 확인했습니다.</label>
 {live&&<label className="block my-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 실제 비용·거래처 잔액에 반영할 내용을 확인했습니다.</label>}
 <button className="border rounded px-4 py-2" disabled={busy||!checked||(live&&!confirmed)||(expense?!(category&&sector):!customer)} onClick={()=>run(()=>apiRequest('POST',`${base}/${row.id}/posting`,{kind:expense?'expense':'payment',...(expense?{category,sector}:{customerId:Number(customer)}),memo,duplicateChecked:true,confirmProduction:confirmed}))}>{busy?'처리 중…':live?'운영 장부에 반영':'테스트 장부에 반영'}</button>
 </>}
 {!!q.data?.history.filter(x=>x.cancelled_at).length&&<details className="my-3"><summary>취소 이력</summary>{q.data?.history.filter(x=>x.cancelled_at).map(x=><p key={x.id}>{currency(x.amount)} · {x.cancel_reason}</p>)}</details>}
 </>}{error&&<p role="alert" className="my-3">{error}</p>}</section>;
}
