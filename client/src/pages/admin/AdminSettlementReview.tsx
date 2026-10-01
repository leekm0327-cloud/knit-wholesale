import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AdminLayout} from '@/components/AdminLayout';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {apiRequest,queryClient} from '@/lib/queryClient';
import {errMsg} from '@/lib/format';

const names:Record<string,string>={chat:'카카오톡',excel:'공장 엑셀',site:'사이트 발주'};
const num=(n:number|null|undefined)=>n==null?'—':n.toLocaleString('ko-KR');
const field='rounded border bg-background px-3 py-2 text-sm';
export default function AdminSettlementReview(){
 const [month,setMonth]=useState(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,7));
 const [supplier,setSupplier]=useState(''),[run,setRun]=useState<number|undefined>(()=>Number(new URLSearchParams(window.location.search).get('review'))||undefined),[excel,setExcel]=useState<File>(),[chat,setChat]=useState<File>();
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[showAll,setShowAll]=useState(false);
 const [editor,setEditor]=useState<any>(),[draft,setDraft]=useState<any>({}),[reason,setReason]=useState(''),[mode,setMode]=useState('confirm');
 const suppliers=useQuery<any[]>({queryKey:['/api/admin/suppliers']});
 const history=useQuery<any[]>({queryKey:['/api/admin/settlements']});
 useEffect(()=>{if(!supplier&&suppliers.data?.length){const s=suppliers.data.find(s=>/클라리멘토/.test(s.name));if(s)setSupplier(String(s.id));}},[suppliers.data,supplier]);
 const result=useQuery<any>({queryKey:['/api/admin/settlements',run],enabled:!!run,queryFn:async()=>{const r=await apiRequest('GET',`/api/admin/settlements/${run}`);return r.json();}});
 const view=result.data;
 useEffect(()=>{if(view){setMonth(view.month);setSupplier(String(view.supplierId));}},[view?.id]);
 async function upload(){setBusy(true);setError('');try{
  const f=new FormData();f.append('month',month);f.append('supplierId',supplier);f.append('confirmUnit',String(confirm));if(excel)f.append('excel',excel);if(chat)f.append('chat',chat);
  const r=await fetch('/api/admin/settlements',{method:'POST',body:f,credentials:'include'});const data=await r.json();if(!r.ok)throw new Error(data.message);
  setRun(data.id);setEditor(undefined);await queryClient.invalidateQueries({queryKey:['/api/admin/settlements']});
 }catch(e){setError(errMsg(e));}finally{setBusy(false);}}
 function edit(line:any,issue=false){setEditor({...line,issue});setDraft({date:line.date,customer:line.customer??'',product:line.product??'',qty:line.qty??1,unit:line.unit??'1kg'});setReason(line.note??'');setMode(issue?'confirm':line.excluded?'exclude':'confirm');setError('');}
 async function save(){setBusy(true);setError('');try{
  const values={...draft,qty:Number(draft.qty)};
  const patch=mode==='reset'?{}:editor.issue?(mode==='interpret'?{interpretation:values}:editor.reviewPatch??{}):mode==='exclude'?{excluded:true}:mode==='edit'?{...values,excluded:false}:editor.reviewPatch??{excluded:false};
  await apiRequest('PUT',`/api/admin/settlements/${run}/decisions/${editor.id}`,{patch,reason,siteFingerprint:view.siteFingerprint});
  setEditor(undefined);await result.refetch();
 }catch(e){setError(errMsg(e));}finally{setBusy(false);}}
 const rows=view?.rows.filter((r:any)=>showAll||r.status!=='수량·금액 일치')??[];
 return <AdminLayout><div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
  <header><h1 className="text-2xl font-semibold">정산 대조</h1><p className="mt-2 text-sm text-muted-foreground">엑셀과 카톡을 올리면 사이트 발주와 함께 비교합니다. 검토 결과는 여기에만 저장되고, 주문·발주·장부는 바뀌지 않습니다.</p></header>
  <details className="rounded-lg border bg-card p-4" open={!view}><summary className="cursor-pointer font-medium">새 정산표 대조하기</summary><section className="mt-4" aria-label="정산 파일 가져오기">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-sm">정산 월<Input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    <label className="text-sm">공급처<select aria-label="공급처" className={field+' w-full'} value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">공급처 선택</option>{suppliers.data?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="text-sm">클라리멘토 정산표<Input type="file" accept=".xlsx" onChange={e=>setExcel(e.target.files?.[0])}/></label>
    <label className="text-sm">카카오톡 대화<Input type="file" accept=".csv" onChange={e=>setChat(e.target.files?.[0])}/></label>
   </div>
   <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> 엑셀 원장 수량이 1kg 기준인지 확인했습니다</label><Button disabled={!excel||!chat||!supplier||!confirm||busy} onClick={upload}>{busy?'불러오는 중…':'대조하기'}</Button><span className="text-muted-foreground">전월 26일 ~ 선택 월 25일</span></div>
   <details className="mt-3 text-sm text-muted-foreground"><summary className="cursor-pointer">파일 준비와 비교 기준</summary><p className="mt-2">‘원장’ 시트가 있는 공장 XLSX와 PC 카카오톡에서 내보낸 UTF-8 CSV를 사용합니다. 각 10MB까지 올릴 수 있습니다. 이름·포장 단위가 명확한 원두만 묶고, 날짜 차이·반복 내역·수정 요청은 확인 대상으로 남깁니다. 카톡의 사진·삭제된 메시지는 내용을 확인할 수 없습니다.</p></details>
  </section></details>
  <div className="flex flex-wrap items-center gap-3"><select aria-label="지난 대조 기록" className={field} value={run??''} onChange={e=>{setRun(Number(e.target.value)||undefined);setEditor(undefined);}}><option value="">지난 대조 기록</option>{history.data?.map(h=><option key={h.id} value={h.id}>{h.month} · {suppliers.data?.find(s=>s.id===h.supplierId)?.name??'공급처'} · #{h.id}</option>)}</select>{run&&<Button variant="outline" disabled={busy||result.isFetching} onClick={()=>{setEditor(undefined);result.refetch();}}>사이트 발주 다시 확인</Button>}</div>
  {(error||result.error||history.error)&&<p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error||errMsg(result.error||history.error)}</p>}
  {result.isFetching&&<p role="status" className="text-sm">대조 내역을 확인하고 있습니다…</p>}
  {view&&<>
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{view.month} 정산 · {view.period.from} ~ {view.period.to}</h2><span className="text-sm text-muted-foreground">검토 저장 {view.decisionCount}건</span></div>
   {view.staleDecisions>0&&<p className="rounded border border-amber-300 p-3 text-sm">사이트 내용이 변경돼 이전 판단 {view.staleDecisions}건을 적용하지 않았습니다. 변경된 발주를 다시 확인해 주세요.</p>}
   <div className="grid gap-3 sm:grid-cols-3">{Object.entries(names).map(([source,name])=><div key={source} className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{name} · 기간 내</p><p className="mt-2 text-2xl font-semibold">{num(view.totals[source].oneKgQty)} <span className="text-sm font-normal">kg</span></p><p className="mt-1 text-xs text-muted-foreground">1kg 포장 기준 · 원문 {num(view.rawTotals[source].oneKgQty)}kg{view.totals[source].otherLines>0?` · 다른 단위 ${view.totals[source].otherLines}행 별도`:''}</p></div>)}</div>
   <details className="rounded border p-3 text-sm"><summary className="cursor-pointer">공장 정산서 청구 금액</summary><p className="mt-2">공급가 {num(view.excelSummary.supplyAmount)}원 · 부가세 {num(view.excelSummary.vat)}원</p><p className="text-muted-foreground">정산서에 기재된 전체 청구액입니다. 기간 밖 청구나 별도 조정이 있으면 위 기간 내 수량 합계와 다를 수 있습니다.</p></details>

   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">거래처·원두별 차이</h2><p className="text-xs text-muted-foreground">카톡 수량 · 엑셀과 사이트의 공급가 비교</p></div><label className="text-sm"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> 일치한 항목도 보기</label></div>
   <div className="overflow-x-auto rounded border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted"><tr>{['거래처 / 원두','카톡','엑셀','사이트','확인'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{rows.map((r:any)=><Row key={r.key} row={r} edit={edit}/>)}{!rows.length&&<tr><td colSpan={5} className="p-5">표시할 차이가 없습니다. 추가·수정 요청과 기간 밖 내역도 확인해 주세요.</td></tr>}</tbody></table></div>
   <section className="rounded border bg-card p-4"><h2 className="font-semibold">추가·수정 요청과 연결 발주 확인 <span className="text-amber-700">{view.unresolvedIssues}건</span></h2><p className="mt-1 text-xs text-muted-foreground">기본 발주 형식으로 읽히지 않은 대화입니다. 추가 수량이면 거래처·품목을 지정해 대조에 포함할 수 있습니다.</p><details className="mt-3"><summary className="cursor-pointer text-sm">원문 펼치기 ({view.issues.length}건)</summary><div className="max-h-96 space-y-3 overflow-y-auto pt-3">{view.issues.map((i:any)=><div key={i.id} className="border-b pb-3 text-sm"><div className="flex items-center justify-between gap-3"><b>{i.reference}</b><Button size="sm" variant="outline" onClick={()=>edit(i,true)}>{i.reviewed?'확인 내용 수정':'확인하기'}</Button></div><p className="whitespace-pre-wrap break-words py-2">{i.text}</p>{i.note&&<p className="text-muted-foreground">확인: {i.note}</p>}</div>)}</div></details></section>
   <p className="text-xs text-muted-foreground">수량이 같아도 원문이 맞다는 뜻은 아닙니다. 다른 날짜·단위·단가 및 삭제된 대화의 영향을 확인한 후 공장과 정산을 확정해 주세요.</p>
  </>}
  {editor&&<section className="sticky bottom-2 z-20 max-h-[70vh] overflow-y-auto rounded-lg border bg-background p-4 shadow-xl" role="region" aria-label="대조 판단 수정"><div className="flex justify-between gap-3"><b>{editor.reference} · 검토</b><button disabled={busy} onClick={()=>setEditor(undefined)} aria-label="검토 닫기">닫기</button></div>
   <select aria-label="검토 방식" className={field+' mt-3'} value={mode} onChange={e=>setMode(e.target.value)}><option value="confirm">현재 대조 내용 확인 · 메모 남기기</option><option value="reset">원문 기준으로 되돌리기</option>{editor.issue?<option value="interpret">대화에서 추가 수량 반영</option>:<><option value="edit">대조용 날짜·거래처·수량 수정</option><option value="exclude">중복·취소 내역으로 대조에서 제외</option></>}</select>
   {(mode==='edit'||mode==='interpret')&&<div className="my-3 grid gap-2 sm:grid-cols-5">{[['date','날짜'],['customer','거래처'],['product','원두'],['qty','수량']].map(([key,label])=><label key={key} className="text-xs">{label}<Input type={key==='date'?'date':key==='qty'?'number':'text'} step="any" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}<label className="text-xs">포장 단위<select className={field+' w-full'} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}>{['1kg','500g','200g','100g','미확인'].map(u=><option key={u}>{u}</option>)}</select></label></div>}
   <label className="mt-3 block text-sm">확인 사유<Input placeholder="예: 공장 확인 후 수정본으로 대체, 원문 9월 9일 10:20" value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="mt-3 flex flex-wrap items-center gap-3"><Button disabled={busy||reason.trim().length<3} onClick={save}>{busy?'저장 중…':'검토 결과 저장'}</Button><span className="text-xs text-muted-foreground">원본 파일과 실제 장부는 변경하지 않습니다.</span></div>
  </section>}
 </div></AdminLayout>;
}
function Row({row:r,edit}:{row:any;edit:(l:any,issue?:boolean)=>void}){
 const [open,setOpen]=useState(false);
 return <><tr className="border-t"><td className="p-3"><b>{r.customer}</b><p className="text-muted-foreground">{r.product} · {r.unit}</p></td>{['chat','excel','site'].map(s=><td key={s} className="p-3 tabular-nums">{num(r.totals[s])}<p className="text-xs text-muted-foreground">{r.amounts[s]!=null?`${num(r.amounts[s])}원`:''}</p></td>)}<td className="p-3"><button className="text-left underline underline-offset-4" onClick={()=>setOpen(!open)} aria-expanded={open}>{r.status} {open?'▴':'▾'}</button></td></tr>
 {open&&<tr><td colSpan={5} className="border-t bg-muted/20 p-3"><div className="grid gap-4 lg:grid-cols-3">{Object.entries(names).map(([source,name])=><section key={source}><h3 className="mb-2 font-semibold">{name}</h3>{!r[source].length&&<p className="text-muted-foreground">읽힌 내역 없음</p>}{r[source].map((l:any)=><div key={l.id} className="mb-2 rounded border bg-background p-3"><p className="font-medium">{l.date} · {l.qty} × {l.unit}{l.excluded?' · 제외':l.outside?' · 기간 밖':''}</p><p className="break-words text-xs text-muted-foreground">{l.reference}</p>{l.warnings.map((w:string)=><p key={w} className="mt-1 text-xs text-amber-800">{w}</p>)}{l.note&&<p className="mt-2 text-xs">검토: {l.note}</p>}<details className="mt-2 text-xs"><summary className="cursor-pointer">원문</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words py-2 font-sans">{l.text}</pre></details><button className="mt-2 text-xs underline" onClick={()=>edit(l)}>대조 판단 {l.reviewed?'수정':'기록'}</button></div>)}</section>)}</div></td></tr>}</>;
}
