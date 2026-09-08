import { useState } from 'react';
import { supplyCatalog, supplyCategories, supplyUnits, type SupplySelection } from '@/lib/supply-catalog';
export default function StaffSupplyPicker({value,onChange}:{value:SupplySelection[];onChange:(value:SupplySelection[])=>void}) {
 const [search,setSearch]=useState('');
 const [category,setCategory]=useState('전체');
 const normalized=(text:string)=>text.replace(/\s/g,'').toLowerCase();
 const shown=supplyCatalog.filter(i=>(category==='전체'||category===i.category)&&normalized(i.name+' '+i.aliases).includes(normalized(search)));
 const toggle=(id:string)=>{const item=supplyCatalog.find(i=>i.id===id)!;onChange(value.some(r=>r.id===id)?value.filter(r=>r.id!==id):[...value,{id,quantity:'1',unit:item.unit}]);};
 const change=(id:string,patch:Partial<SupplySelection>)=>onChange(value.map(r=>r.id===id?{...r,...patch}:r));
 return <section className="supply-picker" aria-label="식재료 선택">
 <details open><summary className="text-sm font-semibold cursor-pointer py-2">식재료 골라 담기</summary>
 <input className="s-input" aria-label="식재료 검색" placeholder="우유, 버터, 난백…" value={search} onChange={e=>setSearch(e.target.value)}/>
 <div className="flex gap-2 overflow-x-auto py-3" aria-label="식재료 분류">{supplyCategories.map(c=><button type="button" key={c} className={'s-chip shrink-0 '+(category===c?'on':'')} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
 <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1" role="group" aria-label="재료 목록">{shown.map(i=>{const selected=value.some(r=>r.id===i.id);return <button type="button" key={i.id} aria-pressed={selected} className={'s-chip text-left flex items-center justify-between gap-2 min-h-11 '+(selected?'on':'')} onClick={()=>toggle(i.id)}><span className="break-words min-w-0">{i.name}</span><span aria-hidden="true">{selected?'✓':'+'}</span></button>;})}{!shown.length&&<p className="col-span-2 text-xs py-3">목록에 없으면 아래 ‘직접 입력’에 적어주세요.</p>}</div>
 </details>
 {value.length>0&&<div className="mt-4 border-t pt-3"><p className="text-xs mb-3">선택한 재료 {value.length}개 · 수량과 단위를 확인해 주세요.</p><div className="space-y-3">{value.map(row=>{const item=supplyCatalog.find(i=>i.id===row.id);return <div key={row.id} className="border-b pb-3"><div className="flex justify-between items-center gap-2 mb-2"><strong className="text-sm font-medium">{item?.name||row.id}</strong><button type="button" className="text-xs underline min-h-8 px-2" aria-label={`${item?.name||row.id} 빼기`} onClick={()=>onChange(value.filter(r=>r.id!==row.id))}>빼기</button></div><div className="grid grid-cols-2 gap-2"><input className="s-input" inputMode="decimal" aria-label={`${item?.name||row.id} 수량`} value={row.quantity} onChange={e=>change(row.id,{quantity:e.target.value})}/><select className="s-input" aria-label={`${item?.name||row.id} 단위`} value={row.unit} onChange={e=>change(row.id,{unit:e.target.value})}>{supplyUnits.map(u=><option key={u}>{u}</option>)}</select></div></div>;})}</div></div>}
 </section>;
}
