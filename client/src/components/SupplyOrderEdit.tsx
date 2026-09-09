import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { errMsg } from '@/lib/format';
import { canEditSupply, supplyLabels, type SupplyRecord } from '@shared/supply-workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function SupplyOrderEdit({row,onSaved}:{row:SupplyRecord;onSaved:()=>void}) {
 const [form,setForm]=useState<SupplyRecord|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){if(!form)return;setBusy(true);setError('');try {
  await apiRequest('PATCH',`/api/admin/staff/supply-board/${row.id}`,{...form,version:form.updatedAt});
  setForm(null);onSaved();
 }catch(e){setError(errMsg(e));onSaved();}finally{setBusy(false);}}
 return <div className="mt-3 text-sm">
  <span className="mr-3 text-muted-foreground">{supplyLabels[row.status]}</span>
  {canEditSupply(row)?<Button size="sm" variant="outline" onClick={()=>{setForm({...row});setError('');}} disabled={busy}>발주 수정</Button>:<span className="text-xs text-muted-foreground">수정 불가 · {row.receivedAt?'입고 완료된 기록':'종료된 기록'}</span>}
  {form&&<fieldset disabled={busy} className="mt-3 rounded border p-4 space-y-3">
   <p>입고 전 발주 수정 · {row.staffName} 작성</p>
   <div className="grid gap-3 sm:grid-cols-2">
    {([['orderDate','발주일','date'],['vendor','구입처','text'],['amount','금액','number'],['destination','배송지','text'],['expectedDate','입고 예정일','date'],['link','구매 링크','url']] as const).map(([key,label,type])=><label key={key}>{label}<Input type={type} value={form[key]} min={type==='number'?0:undefined} step={type==='number'?1:undefined} onChange={e=>setForm({...form,[key]:key==='amount'?Number(e.target.value):e.target.value})}/></label>)}
   </div>
   <label className="block">품목·수량<textarea className="mt-1 w-full rounded border p-2" rows={3} maxLength={2000} value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/></label>
   <label className="block">전달사항<textarea className="mt-1 w-full rounded border p-2" rows={2} maxLength={1000} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
   {error&&<p role="alert" className="text-destructive">{error} 최신 기록으로 다시 열려면 닫고 ‘발주 수정’을 눌러 주세요.</p>}
   <div className="flex gap-2"><Button onClick={save}>{busy?'저장 중…':'수정 저장'}</Button><Button variant="outline" onClick={()=>setForm(null)}>닫기</Button></div>
  </fieldset>}
 </div>;
}
