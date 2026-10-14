import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {API_BASE} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {smartstoreCarriers} from '@shared/smartstore';
import {cafe24Carriers} from '@shared/cafe24';
export function OrderActions({channel,id,canConfirm,canDispatch,itemCodes=[],canWrite=true,refresh}:{channel:'smartstore'|'cafe24';id:string;canConfirm:boolean;canDispatch:boolean;itemCodes?:string[];canWrite?:boolean;refresh:()=>void}){
 const [action,setAction]=useState<'confirm'|'dispatch'|''>(''),[carrier,setCarrier]=useState(''),[trackingNo,setTracking]=useState(''),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState('');
 const carriers=channel==='smartstore'?smartstoreCarriers:cafe24Carriers;
 const history=useQuery<{action:string;outcome:string;message:string;createdAt:string}[]>({queryKey:['order-history',channel,id],queryFn:async()=>{const r=await fetch(`${API_BASE}/api/admin/${channel}/orders/${id}/history`,{credentials:'include',cache:'no-store'});if(!r.ok)throw Error('처리 기록을 불러오지 못했습니다.');return r.json();},retry:false,gcTime:0});
 async function submit(){if(busy)return;setBusy(true);setResult('');try{
  const r=await fetch(`${API_BASE}/api/admin/${channel}/orders/${id}/action`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Order-Action-Key':crypto.randomUUID()},body:JSON.stringify({action,...(action==='dispatch'?{carrier,trackingNo:trackingNo.trim()}:{}),itemCodes,confirmed:true})});
  const b=await r.json().catch(()=>({message:'응답을 읽지 못했습니다. 처리 기록과 채널의 상태를 확인해 주세요.'}));
  setResult(b.message||'결과를 확인해 주세요.');setAction('');setReview(false);await history.refetch();refresh();
 }catch{setResult('응답이 끊겼습니다. 다시 누르기 전에 처리 기록과 채널 상태를 확인해 주세요.');}finally{setBusy(false);}}
 return <section className="space-y-3 rounded-lg border bg-[#f4f0e9] p-4"><h3 className="font-semibold">주문 처리</h3>
 {!canWrite?<p className="text-sm">카페24 주문 수정 권한을 추가 승인하면 배송 준비와 발송을 처리할 수 있어요.</p>:<div className="flex flex-wrap gap-2"><Button disabled={!canConfirm||busy||history.isError} onClick={()=>{setAction('confirm');setReview(true);}}>{channel==='smartstore'?'발주 확인':'배송 준비로 변경'}</Button><Button variant="outline" disabled={!canDispatch||busy||history.isError} onClick={()=>{setAction('dispatch');setReview(false);}}>송장 입력 · 발송</Button></div>}
 <p className="text-xs text-muted-foreground">최신 상태를 다시 확인한 뒤 채널에 반영합니다. 반품·교환·취소 및 분할 배송은 채널 관리자에서 처리해 주세요.</p>
 <a className="inline-block text-xs underline" href={channel==='smartstore'?'https://sell.smartstore.naver.com/':'https://eclogin.cafe24.com/Shop/'} target="_blank" rel="noreferrer">{channel==='smartstore'?'스마트스토어센터':'카페24 관리자'} 열기</a>
 {result&&<p role="status" className="rounded border bg-white p-3 text-sm">{result}</p>}
 {history.isError&&<p role="alert" className="text-sm text-red-700">처리 기록을 불러오지 못했습니다. 새로고침 후 확인해 주세요.</p>}
 {history.data&&history.data.length>0&&<details><summary className="cursor-pointer text-sm">이 화면에서 처리한 기록</summary><ul className="mt-2 space-y-2 text-xs">{history.data.map((h,i)=><li key={i}>{new Date(h.createdAt).toLocaleString('ko-KR')} · {h.action==='confirm'?'준비 처리':'발송'} · {{success:'완료',failed:'실패',unknown:'확인 필요',pending:'처리 중'}[h.outcome]}<p>{h.message}</p></li>)}</ul></details>}
 <Dialog open={!!action} onOpenChange={v=>{if(!busy&&!v){setAction('');setReview(false);}}}><DialogContent><DialogHeader><DialogTitle>{review?'처리 내용 확인':'송장 입력'}</DialogTitle><DialogDescription>주문 {id} · 실제 판매 채널에 반영됩니다.</DialogDescription></DialogHeader>
 {action==='dispatch'&&!review?<div className="space-y-4"><label className="block text-sm">택배사<select aria-label="택배사" className="mt-1 h-10 w-full border bg-white px-2" value={carrier} onChange={e=>setCarrier(e.target.value)}><option value="">택배사 선택</option>{Object.entries(carriers).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="block text-sm">송장번호<Input value={trackingNo} onChange={e=>setTracking(e.target.value)} placeholder="발급받은 실제 송장번호"/></label><p className="text-xs">실제로 택배사에 인계한 주문만 발송 처리해 주세요. 송장 발급·택배 접수 기능은 아닙니다.</p><Button disabled={!carrier||!/^[-A-Za-z0-9]{5,40}$/.test(trackingNo.trim())} onClick={()=>setReview(true)}>입력 내용 확인</Button></div>:<div className="space-y-4"><p>{action==='confirm'?(channel==='smartstore'?'이 주문을 발주 확인하여 발송 준비 상태로 변경합니다.':'선택 상품을 배송 준비 상태로 변경합니다.'):`${carriers[carrier]} · ${trackingNo} 송장으로 발송 처리합니다.`}</p>{itemCodes.length>0&&<p className="break-all text-xs">대상 품목: {itemCodes.join(', ')}</p>}<p className="text-xs">채널 설정에 따라 구매자에게 상태 변경 안내가 전달될 수 있어요.</p><div className="flex gap-2"><Button disabled={busy} onClick={submit}>{busy?'처리 중…':'확인하고 처리'}</Button><Button variant="outline" disabled={busy} onClick={()=>setAction('')}>취소</Button></div></div>}
 </DialogContent></Dialog>
 </section>;
}
