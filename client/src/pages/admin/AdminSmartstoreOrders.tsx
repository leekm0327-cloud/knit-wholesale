import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AdminLayout} from '@/components/AdminLayout';
import {useAuth} from '@/lib/auth';
import {API_BASE} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {RefreshCw,ChevronLeft,ChevronRight,AlertCircle} from 'lucide-react';
import {smartstoreStatusNames,type SmartstoreConnection,type SmartstoreOrderPage,type SmartstoreDetail} from '@shared/smartstore';
function today(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10);}
function time(v:string){return v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';}
function money(v:number|null){return v===null?'금액 확인 필요':new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW'}).format(v);}
async function getJson<T>(path:string):Promise<T>{const r=await fetch(API_BASE+path,{credentials:'include',cache:'no-store'});if(!r.ok){const b=await r.json().catch(()=>null);throw new Error(b?.message||'조회에 실패했습니다.');}return r.json();}
function ErrorBox({error,retry}:{error:unknown;retry?:()=>void}){return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><div className="flex gap-2"><AlertCircle className="h-4 w-4 shrink-0"/><span>{error instanceof Error?error.message:String(error)}</span></div>{retry&&<Button type="button" className="mt-3" variant="outline" size="sm" onClick={retry}>다시 조회</Button>}</div>;}
export default function AdminSmartstoreOrders(){
 const {user}=useAuth();const isAdmin=user?.role==='admin';
 const [date,setDate]=useState(today),[status,setStatus]=useState(''),[number,setNumber]=useState(''),[formError,setFormError]=useState(''),[selected,setSelected]=useState('');
 const [filter,setFilter]=useState(()=>({date:today(),status:'',page:1}));
 const connection=useQuery<SmartstoreConnection>({queryKey:['/api/admin/smartstore/status'],queryFn:()=>getJson('/api/admin/smartstore/status'),enabled:isAdmin,retry:false,staleTime:0});
 // Configuration is not represented as a successful live connection. First query verifies it.
 const canQuery=!!connection.data&&connection.data.state!=='not_configured';
 const params=new URLSearchParams({date:filter.date,page:String(filter.page),...(filter.status?{status:filter.status}:{})});
 const list=useQuery<SmartstoreOrderPage>({queryKey:['smartstore-orders',filter],queryFn:()=>getJson('/api/admin/smartstore/orders?'+params),enabled:isAdmin&&canQuery,retry:false,staleTime:0,gcTime:0});
 const detail=useQuery<SmartstoreDetail>({queryKey:['smartstore-detail',selected],queryFn:()=>getJson('/api/admin/smartstore/orders/'+encodeURIComponent(selected)),enabled:isAdmin&&canQuery&&!!selected,retry:false,staleTime:0,gcTime:0});
 function search(e:React.FormEvent){e.preventDefault();setFormError('');if(!date){setFormError('결제일을 선택해 주세요.');return;}const next={date,status,page:1};if(JSON.stringify(next)===JSON.stringify(filter))void list.refetch();else setFilter(next);}
 function find(e:React.FormEvent){e.preventDefault();if(!/^\d{8,25}$/.test(number.trim())){setFormError('8~25자리 숫자로 된 상품주문번호를 입력해 주세요.');return;}setFormError('');setSelected(number.trim());}
 const verified=!!list.data&&!list.isError;
 return <AdminLayout><div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-7">
  <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-muted-foreground">영업 · 거래처 / NAVER</p><h1 className="mt-1 text-2xl font-semibold">스마트스토어 주문</h1><p className="mt-2 text-sm text-muted-foreground">네이버 주문과 배송정보를 확인하세요.</p></div><Button variant="outline" disabled={connection.isFetching||list.isFetching} onClick={()=>{void connection.refetch();if(canQuery)void list.refetch();}}><RefreshCw className="mr-2 h-4 w-4"/>새로고침</Button></div>
  <nav aria-label="온라인 판매 채널" className="flex gap-2 text-sm"><a className="rounded-md border px-4 py-2" href="#/admin/cafe24-orders">자사몰</a><span aria-current="page" className="rounded-md bg-black px-4 py-2 text-white">스마트스토어</span></nav>
  {connection.isError?<ErrorBox error={connection.error} retry={()=>void connection.refetch()}/>:<div className="rounded-lg border bg-muted/20 p-4"><p className="font-medium">{verified?'네이버 주문 조회 확인됨':connection.isLoading?'연결 상태 확인 중':connection.data?.state==='connected'?'네이버 연결 확인됨':'네이버 연결 준비'}</p><p className="mt-1 text-sm text-muted-foreground">{verified?'네이버에서 최신 주문 정보를 가져왔습니다.':connection.data?.message}</p><p className="mt-2 text-xs text-muted-foreground">조회 전용 · 발주 확인, 송장 등록, 취소·환불은 이 화면에서 처리되지 않습니다.</p></div>}
  {connection.data?.state==='not_configured'&&<div className="rounded-lg border bg-white p-5"><h2 className="font-semibold">연결 준비 사항</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm"><li>네이버 커머스API센터에서 내 스토어 애플리케이션 등록</li><li>서버의 고정 발신 IP 등록과 주문 조회 권한 설정</li><li>서버에 앱 ID·시크릿 저장 후 실제 주문 조회 확인</li></ol><p className="mt-4 text-sm text-muted-foreground">아직 네이버에 연결되지 않았습니다. 주문이 없는 상태와는 다릅니다.</p></div>}
  {canQuery&&<>
   <form onSubmit={search} className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3"><label className="text-xs">결제일 (한국 시간)<Input type="date" className="mt-1" value={date} onChange={e=>setDate(e.target.value)} required/></label><label className="text-xs">상품주문 상태<select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="">전체</option>{Object.entries(smartstoreStatusNames).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><Button type="submit" disabled={list.isFetching} className="self-end">조회</Button></form>
   <form onSubmit={find} className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-xs">상품주문번호로 상세 찾기<Input className="mt-1" inputMode="numeric" placeholder="네이버 상품주문번호" value={number} onChange={e=>setNumber(e.target.value)}/></label><Button variant="outline" type="submit">상세 찾기</Button></form>
   {formError&&<ErrorBox error={formError}/>}
   <p className="text-xs text-muted-foreground">하루 단위 · 결제일 기준 · 상품주문 50건씩 조회 · 미결제 주문은 결제일 조회에 포함되지 않을 수 있어요.{list.data&&` · 조회 ${time(list.data.fetchedAt)}`}</p>
   {list.isFetching&&<p role="status" className="text-sm">네이버에서 주문을 불러오는 중이에요.</p>}
   {list.isError?<ErrorBox error={list.error} retry={()=>void list.refetch()}/>:list.data&&<>
    {list.data.orders.length===0?<div className="rounded-lg border p-10 text-center text-sm">선택한 조건에 해당하는 상품주문이 없습니다.</div>:<div className="space-y-3">{list.data.orders.map(o=><button type="button" key={o.id} onClick={()=>setSelected(o.id)} className="w-full rounded-lg border bg-white p-4 text-left hover:bg-muted/30"><div className="flex flex-wrap justify-between gap-3"><div><p className="break-all font-semibold">{o.id}</p><p className="mt-1 text-xs text-muted-foreground">결제 {time(o.paidAt)} · {o.buyerName||'주문자 정보 없음'}</p></div><div className="text-right"><p className="font-semibold">{money(o.amount)}</p><p className="text-xs">{smartstoreStatusNames[o.status]||o.status||'상태 확인 필요'}</p></div></div><p className="mt-3 break-words text-sm">{o.name} · {o.option} · {o.quantity??'—'}개</p>{o.remainingQuantity!==null&&o.remainingQuantity!==o.quantity&&<p className="mt-1 text-xs text-muted-foreground">잔여 수량 {o.remainingQuantity}개 · 잔여 결제액 {money(o.remainingAmount)}</p>}<span className="mt-3 block text-xs underline">주문·배송 상세 보기</span></button>)}</div>}
    <div className="flex items-center justify-between"><Button variant="outline" disabled={filter.page<=1||list.isFetching} onClick={()=>setFilter(f=>({...f,page:f.page-1}))}><ChevronLeft className="h-4 w-4"/>이전</Button><span className="text-sm">{list.data.page}페이지 · 상품주문 {list.data.orders.length}건</span><Button variant="outline" disabled={!list.data.hasMore||list.isFetching||filter.page>=1000} onClick={()=>setFilter(f=>({...f,page:f.page+1}))}>다음<ChevronRight className="h-4 w-4"/></Button></div>
    {filter.page>=1000&&list.data.hasMore&&<p role="status" className="text-sm">조회 한도에 도달했습니다. 스마트스토어센터에서 나머지 주문을 확인해 주세요.</p>}
   </>}
  </>}
  <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected('');}}><DialogContent className="max-h-[85dvh] w-[calc(100%-32px)] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="break-all pr-5">상품주문 {selected}</DialogTitle><DialogDescription>네이버에 등록된 주문·배송정보입니다.</DialogDescription></DialogHeader>
   {detail.isFetching&&<p role="status">배송정보를 불러오는 중이에요.</p>}{detail.isError&&<ErrorBox error={detail.error} retry={()=>void detail.refetch()}/>}
   {detail.data&&!detail.isError&&<div className="space-y-4 text-sm"><div className="rounded-md border p-4"><p className="font-medium">{detail.data.order.name}</p><p>{detail.data.order.option}</p><p className="mt-2">최초 수량 {detail.data.order.quantity??'—'}개 · 최초 결제액 {money(detail.data.order.amount)}</p>{detail.data.order.remainingQuantity!==null&&<p>잔여 수량 {detail.data.order.remainingQuantity}개 · 잔여 결제액 {money(detail.data.order.remainingAmount)}</p>}<p className="mt-2">{smartstoreStatusNames[detail.data.order.status]||detail.data.order.status}</p><p className="mt-2 break-all text-xs text-muted-foreground">주문번호 {detail.data.order.orderId||'—'} · 상품주문번호 {detail.data.order.id}</p>{detail.data.order.shippingDueDate&&<p className="mt-2">발송 기한 {time(detail.data.order.shippingDueDate)}</p>}</div>
    <div><h3 className="mb-2 font-semibold">배송받는 분</h3><div className="rounded-md bg-muted/30 p-4 leading-7"><p>{detail.data.recipient.name||'수령인 정보 없음'}</p><p>{detail.data.recipient.phones.join(' / ')||'연락처 정보 없음'}</p><p className="break-words">{detail.data.recipient.zipcode&&`(${detail.data.recipient.zipcode}) `}{detail.data.recipient.address||'주소 정보 없음'}</p><p>배송 요청: {detail.data.recipient.message||'없음'}</p></div></div>
    <div><h3 className="mb-2 font-semibold">배송·송장 정보</h3><div className="rounded-md border p-4 leading-7"><p>택배사 코드: {detail.data.delivery.carrier||'미등록'}</p><p className="break-all">송장번호: {detail.data.delivery.trackingNo||'미등록'}</p><p>배송 상태: {detail.data.delivery.status||'정보 없음'}</p>{detail.data.delivery.sentAt&&<p>발송 {time(detail.data.delivery.sentAt)}</p>}{detail.data.delivery.wrongTracking&&<p className="text-red-700">네이버에서 송장 오류로 표시한 주문입니다.</p>}</div></div>
    {(detail.data.hasClaims||detail.data.order.claimStatus)&&<p className="rounded-md border border-amber-200 bg-amber-50 p-3">취소·반품·교환 정보가 있는 주문입니다. 상세 처리 내역과 환불 금액은 스마트스토어센터에서 확인해 주세요.</p>}
    <p className="text-xs text-muted-foreground">개인정보 제공 기간이나 가림 처리에 따라 일부 정보가 표시되지 않을 수 있어요. 조회 {time(detail.data.fetchedAt)}</p>
   </div>}
  </DialogContent></Dialog>
 </div></AdminLayout>;
}
