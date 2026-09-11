import OrderInvoiceQueue from './OrderInvoiceQueue';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminFold } from '@/components/AdminFold';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';
import { blankParty, type InvoiceDraft } from '@shared/tax-invoices';
const money=(v:unknown)=>Number(v||0).toLocaleString('ko-KR');
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const states:Record<string,string>={draft:'발행 전',sending:'요청 중 · 상태 확인',unknown:'응답 확인 필요',rejected:'발행 실패',issued:'발행 완료',cancelled:'취소됨',external:'기존 발행 기록',discarded:'작성 취소'};
const partyLabels:Record<string,string>={corpNum:'사업자번호',name:'상호',ceo:'대표자명',address:'사업장 주소',bizType:'업태',bizClass:'종목',contact:'담당자',email:'이메일'};
type Party=typeof blankParty;
function PartyFields({value,onChange,prefix}:{value:Party;onChange:(p:Party)=>void;prefix:string}){
 return <div className="grid sm:grid-cols-2 gap-3 my-3">{Object.entries(partyLabels).map(([k,label])=><label className="text-sm" key={k}>{label}{!['bizType','bizClass'].includes(k)&&' *'}<input className="block border rounded p-2 w-full mt-1" aria-label={`${prefix} ${label}`} type={k==='email'?'email':'text'} maxLength={k==='address'?300:k==='name'?200:100} value={(value as any)[k]} onChange={e=>onChange({...value,[k]:k==='corpNum'?e.target.value.replace(/\D/g,'').slice(0,10):e.target.value})}/></label>)}</div>;
}
export default function TaxInvoices(){const [env,setEnv]=useState<'test'|'production'>('production');return <AdminLayout><div className="erp-page"><div className="erp-page-heading"><h1>세금계산서</h1><details className="text-sm"><summary>{env==='production'?'운영 · 환경 설정':'테스트 모드 · 환경 설정'}</summary><label className="block py-2">환경 <select aria-label="세금계산서 환경" value={env} onChange={e=>setEnv(e.target.value as any)}><option value="test">테스트</option><option value="production">운영</option></select></label></details></div><TaxPage key={env} env={env}/></div></AdminLayout>;}
function TaxPage({env}:{env:'test'|'production'}){
 const cache=useQueryClient();
 const {user}=useAuth(),owner=(user as any)?.adminRole==='owner',base=`/api/admin/tax-invoices/${env}`;
 const q=useQuery<any>({queryKey:[base],enabled:owner});
 const customers=useQuery<any[]>({queryKey:['/api/admin/customers'],enabled:owner});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[certificate,setCertificate]=useState('미확인');
 const [profile,setProfile]=useState<Party|null>(null),[buyer,setBuyer]=useState<Party>({...blankParty}),[customer,setCustomer]=useState(''),[compose,setCompose]=useState(false);
 const [date,setDate]=useState(today()),[item,setItem]=useState('원두'),[amount,setAmount]=useState(''),[tax,setTax]=useState(''),[purpose,setPurpose]=useState<'1'|'2'>('1'),[remark,setRemark]=useState('');
 const [selected,setSelected]=useState<any>(null),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{if(selected)document.getElementById('tax-invoice-preview')?.scrollIntoView({behavior:'smooth',block:'start'});},[selected?.id]);
 const supplier:Party=profile||q.data?.profile||{...blankParty,corpNum:q.data?.corp||''};
 const act=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();await q.refetch();await cache.invalidateQueries({queryKey:[base+'/orders']});}catch(e:any){setMessage(e.message||'처리하지 못했습니다.');}finally{setBusy(false);}};
 const post=async(path:string,body:any={})=>(await apiRequest('POST',base+path,body)).json();
 const setup=(kind:string)=>{const w=window.open('about:blank','_blank');if(w)w.opener=null;void act(async()=>{try{const r=await post('/setup',{kind});if(w)w.location.href=r.url;else setMessage('팝업을 허용한 뒤 다시 눌러 주세요.');}catch(e){w?.close();throw e;}});};
 if(!owner)return <p>대표 계정에서 사용할 수 있어요.</p>;
 return <>
 {q.isError&&<p role="alert">설정을 불러오지 못했습니다. <button onClick={()=>q.refetch()}>다시 시도</button></p>}
 {message&&<p role="status" className="border rounded p-3 my-3 whitespace-pre-wrap">{message}</p>}
 {q.data&&!q.data.configured&&<p>통장 내역의 연결 설정에서 바로빌 {env==='test'?'테스트':'운영'} 정보를 먼저 저장해 주세요.</p>}
 <AdminFold id={`tax-${env}-setup`} title="공급자 정보 · 인증서">
 <p className="text-sm my-2">은행 조회와 같은 바로빌 연결을 사용합니다. 공급자 정보와 공동인증서를 확인한 뒤 발행할 수 있습니다.</p>
 <div className="flex gap-3 flex-wrap my-3"><button disabled={busy||!q.data?.configured} onClick={()=>act(async()=>{const r=await post('/certificate');setCertificate(r.valid?'유효함':'확인 필요');})}>인증서 상태 확인</button><span>{certificate}</span><button disabled={busy||!q.data?.configured} onClick={()=>setup('certificate')}>바로빌 인증서 등록</button></div>
 <h2 className="font-semibold mt-4">공급자 사업자등록 정보</h2><PartyFields prefix="공급자" value={supplier} onChange={setProfile}/><button className="border rounded px-4 py-2" disabled={busy||!q.data?.configured} onClick={()=>act(async()=>{await apiRequest('PUT',base+'/profile',supplier);setMessage('공급자 정보를 저장했습니다.');})}>공급자 정보 저장</button>
 <p className="text-sm mt-3">조회·발행은 기존 매출·비용·미수금에 금액을 추가하지 않습니다. 다른 서비스에서 이미 발행한 건은 중복 발행하지 마세요. 수정·취소는 바로빌에서 원본 상태를 확인하고 진행해 주세요.</p>
 </AdminFold>
 <OrderInvoiceQueue env={env} supplier={supplier} PartyFields={PartyFields} onDocument={r=>{setSelected(r);setConfirmed(false);}}/>
 <p className="text-sm my-4">이 화면에서 작성하고 바로빌로 발행 요청한 문서의 내용·발행 상태·국세청 전송 상태를 확인합니다.</p>
 <div className="flex gap-3 my-4"><button className="border rounded px-4 py-2" disabled={busy||!q.data?.configured} onClick={()=>setCompose(!compose)}>{compose?'작성 접기':'새 세금계산서 작성'}</button><button onClick={()=>q.refetch()}>목록 새로고침</button></div>
 {compose&&<section className="border rounded p-5 my-4"><h2 className="font-semibold">일반 과세 세금계산서 작성</h2><p className="text-sm my-2">거래처 정보를 가져온 뒤 사업자등록증 기준으로 대표자·주소를 확인해 주세요. 담당자명과 배송지는 법정 정보와 다를 수 있습니다.</p>
 <label>거래처 <select aria-label="발행 거래처" value={customer} onChange={e=>{setCustomer(e.target.value);const c=customers.data?.find(c=>String(c.id)===e.target.value);setBuyer(c?{...blankParty,corpNum:(c.bizRegNo||'').replace(/\D/g,''),name:c.businessName||'',address:c.defaultAddress||'',contact:c.managerName||'',email:c.taxEmail||c.email||''}:{...blankParty});}}><option value="">직접 입력</option>{(customers.data||[]).filter(c=>c.role==='customer'&&!c.isStore).map(c=><option value={c.id} key={c.id}>{c.businessName}</option>)}</select></label>
 {customers.isError&&<p>거래처를 불러오지 못했습니다. 직접 입력하거나 새로고침해 주세요.</p>}
 <PartyFields prefix="공급받는자" value={buyer} onChange={setBuyer}/>
 <div className="flex gap-3 flex-wrap my-3"><label>작성일 <input aria-label="작성일" type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/></label><label>구분 <select aria-label="청구·영수 구분" value={purpose} onChange={e=>setPurpose(e.target.value as any)}><option value="1">영수 · 대금 받음</option><option value="2">청구 · 대금 받기 전</option></select></label></div>
 <div className="grid sm:grid-cols-3 gap-3"><label>품목 <input className="border p-2 w-full" aria-label="품목" value={item} maxLength={100} onChange={e=>setItem(e.target.value)}/></label><label>공급가액 <input className="border p-2 w-full" aria-label="공급가액" type="number" min="1" step="1" value={amount} onChange={e=>{setAmount(e.target.value);setTax(String(Math.floor(Number(e.target.value)/10)));}}/></label><label>세액 <input className="border p-2 w-full" aria-label="세액" type="number" min="0" step="1" value={tax} onChange={e=>setTax(e.target.value)}/></label></div>
 <p className="font-semibold my-3">합계 {money(Number(amount)+Number(tax))}원</p><input className="border rounded p-2 w-full" aria-label="비고" placeholder="비고 (선택)" value={remark} maxLength={150} onChange={e=>setRemark(e.target.value)}/>
 <button className="border rounded px-4 py-2 my-3" disabled={busy} onClick={()=>act(async()=>{const d:InvoiceDraft={supplier,buyer,date,item,amount:Number(amount),tax:Number(tax),purpose,remark};const r=await post('/drafts',d);setSelected(r);setConfirmed(false);setCompose(false);})}>저장하고 발행 내용 확인</button></section>}
 {selected?.state==='external'?<section className="border rounded p-4"><p>기존 발행 기록 · 승인번호 {selected.payload.approval}</p><p>사용자가 확인하여 연결한 기록입니다.</p><button onClick={()=>setSelected(null)}>닫기</button></section>:selected&&<section id="tax-invoice-preview" className="border-2 rounded p-5 my-5"><button className="float-right" onClick={()=>setSelected(null)}>닫기</button><h2 className="font-semibold">{env==='production'?'운영 발행':'테스트 발행'} · {states[selected.state]}</h2><p className="my-2">{selected.payload.date} · {selected.payload.purpose==='1'?'영수':'청구'} · {selected.payload.item}</p>
 <div className="grid sm:grid-cols-2 gap-4 my-4">{[['공급자',selected.payload.supplier],['공급받는자',selected.payload.buyer]].map(([label,p]:any)=><div key={label}><h3 className="font-semibold">{label}</h3>{Object.entries(partyLabels).map(([k,l])=><p key={k} className="text-sm">{l}: {p[k]||'—'}</p>)}</div>)}</div>
 <p>공급가액 {money(selected.payload.amount)}원 + 세액 {money(selected.payload.tax)}원 = <strong>{money(selected.payload.amount+selected.payload.tax)}원</strong></p><p>{selected.payload.remark}</p>{selected.payload.lines&&<table className="w-full text-sm my-3"><thead><tr>{['품목','수량','단가','공급가액','세액'].map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>{selected.payload.lines.map((l:any,i:number)=><tr key={i}><td>{l.name}<small className="block">{l.description}</small></td><td>{l.qty}</td><td>{l.unitPrice}</td><td>{money(l.amount)}</td><td>{money(l.tax)}</td></tr>)}</tbody></table>}<p className="text-sm my-2">관리번호 {selected.id}</p>
 {selected.error&&<p role="alert">{selected.error}</p>}
 {selected.remote_state&&<p className="my-2">국세청 전송: {({'1':'전송 전','2':'전송 대기','3':'전송 중','4':'완료','5':'실패'} as any)[selected.remote_state.NTSSendState]||'확인 필요'} · 승인번호 {selected.remote_state.NTSSendKey||'미발급'}</p>}
 {['draft','rejected'].includes(selected.state)?<><label className="block my-4"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 공급자·받는 분·금액을 확인했고, 다른 서비스·홈택스 등에 이미 발행한 건이 아닙니다.</label><p className="text-sm my-2">{env==='production'?'발행하면 실제 세금계산서가 생성되고 받는 분에게 이메일이 전송됩니다. 바로빌 이용료가 적용됩니다.':'테스트 환경으로만 발행을 요청합니다.'}</p><button className="bg-slate-800 text-white rounded px-4 py-2" disabled={busy||!confirmed} onClick={()=>act(async()=>{setSelected(await post(`/drafts/${selected.id}/issue`,{confirm:selected.id,duplicateChecked:confirmed}));setConfirmed(false);})}>{busy?'요청 중…':env==='production'?'확인한 내용으로 실제 발행':'테스트 발행'}</button></>:<p className="my-3">응답이 불확실할 때는 새 문서를 만들지 말고 상태를 확인해 주세요.</p>}
 {selected.state==='draft'&&<button className="border rounded px-3 py-2 ml-3" disabled={busy} onClick={()=>act(async()=>{await post(`/drafts/${selected.id}/discard`);setSelected(null);setMessage('작성을 취소했습니다. 주문 목록을 새로고침하면 다시 선택할 수 있습니다.');})}>발행 전 작성 취소</button>}
 <button className="border rounded px-4 py-2 ml-3" disabled={busy} onClick={()=>act(async()=>setSelected(await post(`/drafts/${selected.id}/status`)))}>발행 상태 조회</button></section>}
 <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['작성일','거래처','품목','합계','상태',''].map((l,i)=><th className="text-left border-b p-3" key={i}>{l}</th>)}</tr></thead><tbody>{q.data?.rows.map((r:any)=><tr key={r.id}><td className="p-3 border-b">{r.payload.date}</td><td className="p-3 border-b">{r.payload.buyer.name}</td><td className="p-3 border-b">{r.payload.item}</td><td className="p-3 border-b">{money(r.payload.amount+r.payload.tax)}원</td><td className="p-3 border-b">{states[r.state]}</td><td className="p-3 border-b"><button onClick={()=>{setSelected(r);setConfirmed(false);}}>내용·발행</button></td></tr>)}</tbody></table>{q.data?.rows.length===0&&<p className="p-4">이 환경에서 작성한 문서가 없습니다.</p>}</div>
 </>;
}
