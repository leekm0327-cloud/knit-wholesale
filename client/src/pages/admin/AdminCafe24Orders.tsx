import {OrderActions} from '@/components/orders/OrderActions';
import {saveCsv} from '@/components/orders/order-tools';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AdminLayout} from '@/components/AdminLayout';
import {useAuth} from '@/lib/auth';
import {apiRequest,API_BASE} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {RefreshCw,ChevronLeft,ChevronRight,Link2,Package,Truck,AlertCircle} from 'lucide-react';
import {cafe24StatusNames,type Cafe24Connection,type Cafe24Order,type Cafe24OrderPage,type Cafe24OrderDetail} from '@shared/cafe24';
function kstDate(days=0){const d=new Date(Date.now()+9*3600000);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function money(o:Cafe24Order){if(o.amount===null)return '금액 확인 필요';try{return new Intl.NumberFormat('ko-KR',{style:'currency',currency:o.currency}).format(Number(o.amount));}catch{return `${o.amount} ${o.currency}`;}}
function payment(v:string){return v==='T'?'결제 완료':v==='F'?'미결제':v==='M'?'부분 결제':'확인 필요';}
function datetime(v:string){const date=new Date(v);return Number.isFinite(date.getTime())?date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):v||'—';}
function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><div className="flex items-start gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5"/><span>{message}</span></div>{retry&&<Button variant="outline" className="mt-3" size="sm" onClick={retry}>다시 조회</Button>}</div>;}
function err(e:unknown){return e instanceof Error?e.message.replace(/^\d+:\s*/, ''):'조회에 실패했습니다.';}
async function getJson<T>(url:string):Promise<T>{const res=await fetch(API_BASE+url,{credentials:'include',cache:'no-store'});if(!res.ok){let message='조회에 실패했습니다.';try{message=(await res.json()).message||message;}catch{}throw new Error(message);}return res.json();}
export default function AdminCafe24Orders(){
 const {user}=useAuth();const isAdmin=user?.role==='admin',isOwner=(user as any)?.adminRole==='owner';
 const [start,setStart]=useState(()=>kstDate(-29)),[end,setEnd]=useState(()=>kstDate()),[orderId,setOrderId]=useState(''),[status,setStatus]=useState('');
 const [filter,setFilter]=useState(()=>({start:kstDate(-29),end:kstDate(),orderId:'',status:'',page:1}));
 const [text,setText]=useState(''),[queue,setQueue]=useState('all'),[progress,setProgress]=useState(''),[chosen,setChosen]=useState<string[]>([]);
 const [selected,setSelected]=useState(''),[formError,setFormError]=useState(''),[connecting,setConnecting]=useState(false),[connectError,setConnectError]=useState(()=>{const error=new URLSearchParams(window.location.search).get('cafe24_connection_error');return error==='invalid_scope'?'카페24가 추가 권한을 아직 허용하지 않았습니다. 개발자센터의 주문 읽기+쓰기 설정을 확인한 뒤 다시 연결해 주세요.':error?'카페24 추가 권한 연결이 완료되지 않았습니다. 기존 조회 연결은 유지됩니다.':'';});
 const connection=useQuery<Cafe24Connection>({queryKey:['/api/admin/cafe24/status'],queryFn:()=>getJson('/api/admin/cafe24/status'),enabled:isAdmin,staleTime:0,retry:false});
 const list=useQuery<Cafe24OrderPage>({queryKey:['cafe24-orders',filter.start,filter.end,filter.orderId,filter.status],queryFn:async({signal})=>{
  const orders=new Map<string,Cafe24Order>();let fetchedAt='';
  for(let page=1;page<=300;page++){
   const params=new URLSearchParams({start:filter.start,end:filter.end,page:String(page),...(filter.orderId?{orderId:filter.orderId}:{}),...(filter.status?{status:filter.status}:{})});
   const r=await fetch(API_BASE+'/api/admin/cafe24/orders?'+params,{credentials:'include',cache:'no-store',signal});const b=await r.json();if(!r.ok)throw Error(b.message||'기간 조회 실패');const part=b as Cafe24OrderPage;
   part.orders.forEach(o=>orders.set(o.id,o));fetchedAt=part.fetchedAt;setProgress(`${orders.size}건 불러옴`);
   if(!part.hasMore)return {orders:Array.from(orders.values()).sort((a,b)=>b.orderedAt.localeCompare(a.orderedAt)),page:1,pageSize:50,hasMore:false,fetchedAt};
  }
  throw Error('주문이 많아 조회 한도에 도달했습니다. 기간을 줄여 주세요.');
 },enabled:isAdmin&&connection.data?.state==='connected',staleTime:0,gcTime:0,retry:false});
 const detail=useQuery<Cafe24OrderDetail>({queryKey:['cafe24-order-detail',selected],queryFn:()=>getJson('/api/admin/cafe24/orders/'+encodeURIComponent(selected)),enabled:isAdmin&&!!selected&&connection.data?.state==='connected',staleTime:0,gcTime:0,retry:false});
 async function connect(write=false){setConnecting(true);setConnectError('');try{const res=await apiRequest('POST','/api/admin/cafe24/connect',{write});const {url}=await res.json();window.location.assign(url);}catch(e){setConnectError(err(e));setConnecting(false);}}
 function search(e:React.FormEvent){e.preventDefault();const diff=Date.parse(end)-Date.parse(start);if(!Number.isFinite(diff)||diff<0||diff>=90*86400000){setFormError('시작일과 종료일을 확인해 주세요. 한 번에 최대 90일까지 조회할 수 있어요.');return;}if(orderId.trim()&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(orderId.trim())){setFormError('주문번호를 확인해 주세요.');return;}setFormError('');setSelected('');setChosen([]);const next={start,end,orderId:orderId.trim(),status,page:1};if(JSON.stringify(next)===JSON.stringify(filter))void list.refetch();else setFilter(next);}
 const data=list.data;
 function preset(days:number){setStart(kstDate(1-days));setEnd(kstDate());setChosen([]);setFilter({start:kstDate(1-days),end:kstDate(),orderId:'',status:'',page:1});setStatus('');setOrderId('');}
 function inQueue(o:Cafe24Order,key:string){if(key==='new')return o.items.some(i=>i.status==='N10');if(key==='ready')return o.items.some(i=>['N20','N21','N22'].includes(i.status));if(key==='shipping')return o.items.some(i=>i.status==='N30');if(key==='claim')return o.cancelled==='T'||o.items.some(i=>/^[CRE]/.test(i.status));return true;}
 const orders=(data?.orders||[]).filter(o=>inQueue(o,queue)&&(!text||[o.id,o.buyerName,...o.items.flatMap(i=>[i.name,i.option])].join(' ').toLowerCase().includes(text.toLowerCase())));
 const visible=orders.slice((filter.page-1)*50,filter.page*50);
 function exportOrders(){saveCsv(`자사몰-준비목록-${filter.start}-${filter.end}.csv`,[['주문번호','구매자','상품','옵션','수량','상태'],...(data?.orders||[]).filter(o=>chosen.includes(o.id)).flatMap(o=>o.items.map(i=>[o.id,o.buyerName,i.name,i.option,i.quantity,i.statusText||cafe24StatusNames[i.status]||i.status]))]);}

 return <AdminLayout><div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-7">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">온라인 주문 / CAFE24</p><h1 className="mt-1 text-2xl font-semibold">자사몰 주문</h1><p className="mt-2 text-sm text-muted-foreground">카페24 주문과 배송정보를 한곳에서 확인하세요.</p></div><Button variant="outline" disabled={list.isFetching||connection.isFetching} onClick={()=>{void connection.refetch();if(connection.data?.state==='connected'){void list.refetch();if(selected)void detail.refetch();}}}><RefreshCw className="mr-2 h-4 w-4"/>새로고침</Button></div>
  {connection.isPending&&<p role="status">연결 상태를 확인하고 있어요.</p>}
  <nav aria-label="온라인 판매 채널" className="flex gap-2 text-sm"><span aria-current="page" className="rounded-md bg-black px-4 py-2 text-white">자사몰</span><a className="rounded-md border px-4 py-2" href="#/admin/smartstore-orders">스마트스토어</a></nav>
  {connection.isError&&<ErrorBox message={err(connection.error)} retry={()=>void connection.refetch()}/>}
  {connection.data&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-[#f4f0e9] p-4"><div><p className="text-sm font-semibold">{connection.data.state==='connected'?'카페24 연결됨':'카페24 연결 준비'}{connection.data.mallId&&` · ${connection.data.mallId}`}</p><p className="mt-1 text-sm">{connection.data.message}</p><p className="mt-1 text-xs text-muted-foreground">{connection.data.canWrite?'주문 상세에서 배송 준비와 송장 입력 · 발송을 처리할 수 있어요.':'조회 연결됨 · 주문 처리 권한을 추가하면 배송 준비와 발송이 가능해요.'}</p></div>{isOwner&&['not_connected','reauthorize','connected'].includes(connection.data.state)&&<Button variant="outline" disabled={connecting} onClick={()=>void connect(true)}><Link2 className="mr-2 h-4 w-4"/>{connecting?'연결 중…':connection.data.state==='connected'?(connection.data.canWrite?'연결 다시 승인':'주문 처리 권한 추가'):'카페24 연결 승인'}</Button>}</div>}
  {connectError&&<ErrorBox message={connectError}/>}
  {connection.data?.state==='not_configured'&&<div className="rounded-lg border p-5 text-sm leading-7"><h2 className="font-semibold">실제 주문을 불러오기 위한 준비</h2><ol className="list-decimal pl-5"><li>카페24 개발자센터에서 니트커피용 앱을 등록합니다.</li><li>주문 조회 권한과 서버 연결 설정을 완료합니다.</li><li>대표 계정으로 연결을 승인하면 주문을 조회할 수 있습니다.</li></ol><p className="mt-2 text-muted-foreground">아직 연결되지 않았습니다. 주문이 없는 상태와는 다릅니다.</p></div>}
  {connection.data?.state==='connected'&&<>
   <div className="flex flex-wrap gap-2">{[1,7,30,90].map(d=><Button key={d} variant="outline" disabled={list.isFetching} onClick={()=>preset(d)}>{d===1?'오늘':`최근 ${d}일`}</Button>)}</div>
   <form onSubmit={search} className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
    <label className="text-xs">주문일 시작<Input className="mt-1" type="date" value={start} onInput={e=>setStart(e.currentTarget.value)} onChange={e=>setStart(e.target.value)} required/></label>
    <label className="text-xs">주문일 종료<Input className="mt-1" type="date" value={end} onInput={e=>setEnd(e.currentTarget.value)} onChange={e=>setEnd(e.target.value)} required/></label>
    <label className="text-xs">주문번호<Input className="mt-1" value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="전체 주문"/></label>
    <label className="text-xs">상품 처리 상태<select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="">전체</option>{Object.entries(cafe24StatusNames).map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label>
    <Button className="self-end" type="submit" disabled={list.isFetching}>조회</Button>
   </form>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{Object.entries({all:'전체',new:'상품 준비',ready:'발송 대기',shipping:'배송 중',claim:'취소·반품·교환'}).map(([key,label])=><button key={key} aria-pressed={queue===key} className={`rounded-lg border p-3 text-left ${queue===key?'bg-black text-white':'bg-white'}`} onClick={()=>{setQueue(key);setChosen([]);setFilter(f=>({...f,page:1}));}}><span className="text-xs">{label}</span><strong className="mt-1 block text-xl">{list.isFetching||list.isError?'—':(data?.orders||[]).filter(o=>inQueue(o,key)).length}</strong></button>)}</div>
   <label className="block text-xs">불러온 기간 내 검색<Input placeholder="주문번호 · 구매자 · 상품 · 옵션" value={text} onChange={e=>{setText(e.target.value);setChosen([]);setFilter(f=>({...f,page:1}));}}/></label>
   {formError&&<ErrorBox message={formError}/>}
   <p className="text-xs text-muted-foreground">선택 기간과 상태 조건 기준 · 기간 밖 주문은 포함되지 않아요. 최대 90일{data&&` · 최근 조회 ${datetime(data.fetchedAt)}`}</p>
   {list.isFetching&&<p role="status" className="text-sm">카페24에서 주문을 조회하고 있어요. {progress}</p>}
   {list.isError&&<ErrorBox message={err(list.error)} retry={()=>void list.refetch()}/>}
   {!list.isError&&!list.isFetching&&data&&<>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setChosen(visible.map(o=>o.id))}>현재 페이지 선택</Button><Button variant="outline" disabled={!chosen.length} onClick={()=>setChosen([])}>선택 해제</Button><Button disabled={!chosen.length} onClick={exportOrders}>선택 {chosen.length}건 준비 목록 다운로드</Button></div>
    <div className="space-y-3">{orders.length===0?<div className="rounded-lg border p-10 text-center text-sm">선택한 조건에 해당하는 주문이 없습니다.</div>:visible.map(o=><div key={o.id} className="flex items-start gap-2"><input type="checkbox" className="mt-5 h-4 w-4 shrink-0" aria-label={`${o.id} 선택`} checked={chosen.includes(o.id)} onChange={e=>setChosen(ids=>e.target.checked?[...ids,o.id]:ids.filter(id=>id!==o.id))}/><button type="button" key={o.id} onClick={()=>setSelected(o.id)} aria-expanded={selected===o.id} className={`w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 ${selected===o.id?'border-black bg-muted/30':'bg-white'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-semibold">{o.id}</p><p className="mt-1 text-xs text-muted-foreground">{datetime(o.orderedAt)} · {o.buyerName||'주문자 정보 없음'}</p></div><div className="text-right"><p className="font-semibold">{money(o)}</p><p className="text-xs">{payment(o.paid)}{o.cancelled==='T'?' · 취소 주문':''}</p></div></div><div className="mt-3 space-y-1 text-sm">{o.items.map((i,n)=><p key={i.code||n} className="break-words">{i.name||'상품명 확인 필요'} {i.option&&`· ${i.option}`} · {i.quantity??'—'}개 <span className="ml-1 text-xs text-muted-foreground">{i.statusText||cafe24StatusNames[i.status]||i.status||'상태 확인 필요'}</span></p>)}</div><span className="mt-3 block text-xs underline">주문·배송 상세 보기</span></button></div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={filter.page===1||list.isFetching} onClick={()=>{setSelected('');setFilter(f=>({...f,page:f.page-1}));}}><ChevronLeft className="h-4 w-4"/>이전</Button><span className="text-sm">{filter.page}페이지 · 검색 결과 {orders.length}건</span><Button variant="outline" disabled={filter.page*50>=orders.length||list.isFetching} onClick={()=>{setSelected('');setFilter(f=>({...f,page:f.page+1}));}}>다음<ChevronRight className="h-4 w-4"/></Button></div>
    {false&&<p role="status">더 많은 주문이 있습니다. 조회 기간을 줄여 주세요.</p>}
   </>}
   <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected('');}}><DialogContent className="max-h-[85dvh] w-[calc(100%-32px)] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="break-all pr-5">{selected} · 주문·배송 상세</DialogTitle><DialogDescription>카페24에 등록된 주문과 배송정보입니다.</DialogDescription></DialogHeader><div className="space-y-4">{detail.isFetching&&<p role="status">배송정보를 불러오는 중이에요.</p>}{detail.isError&&<ErrorBox message={err(detail.error)} retry={()=>void detail.refetch()}/>}{detail.data&&!detail.isError&&<>
    <p className="text-sm">{payment(detail.data.order.paid)} · {money(detail.data.order)} · 조회 {datetime(detail.data.fetchedAt)}</p>
    <div><h3 className="mb-2 text-sm font-semibold">주문 상품</h3><ul className="space-y-2 text-sm">{detail.data.order.items.map((item,i)=><li key={item.code||i} className="rounded-md border p-3"><p>{item.name} · {item.quantity??'—'}개</p>{item.option&&<p className="text-muted-foreground">{item.option}</p>}<p className="mt-1 text-xs">{item.statusText||cafe24StatusNames[item.status]||item.status||'상태 확인 필요'}</p></li>)}</ul></div>
    <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4"/>배송받는 분</h3>{detail.data.receivers.length===0?<p className="text-sm">등록된 배송지 정보가 없습니다.</p>:detail.data.receivers.map((r,i)=><div className="mb-3 rounded-md bg-muted/40 p-4 text-sm leading-7" key={r.shippingCode||i}><p className="font-semibold">{r.name||'수령인 정보 없음'}{r.shippingCode&&` · ${r.shippingCode}`}</p><p>{[r.cellphone,r.phone].filter(Boolean).join(' / ')||'연락처 정보 없음'}</p><p className="break-words">{r.zipcode&&`(${r.zipcode}) `}{r.address||'주소 정보 없음'}</p><p className="break-words text-muted-foreground">배송 요청: {r.message||'없음'}</p></div>)}</div>
    <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4"/>배송·송장 정보</h3>{detail.data.shipments.length===0?<p className="text-sm">등록된 송장 정보가 없습니다. 상품별 처리 상태를 함께 확인해 주세요.</p>:detail.data.shipments.map((s,i)=><div key={s.code||i} className="mb-3 rounded-md border p-4 text-sm leading-7"><p>배송번호: {s.code||'—'} · {{standby:'배송 대기',shipping:'배송 중',shipped:'배송 완료'}[s.status]||s.status||'상태 확인 필요'}</p><p>택배사 코드: {s.carrierCode||'미등록'}</p><p className="break-all">송장번호: {s.trackingNo||'미등록'}</p>{s.itemCodes.length>0&&<p className="break-all text-xs text-muted-foreground">품주번호: {s.itemCodes.join(', ')}</p>}</div>)}</div>
    <OrderActions key={selected} channel="cafe24" id={selected} canWrite={!!connection.data?.canWrite} canConfirm={detail.data.order.paid==='T'&&detail.data.order.items.length>0&&detail.data.order.items.every(i=>i.status==='N10')} canDispatch={detail.data.order.paid==='T'&&detail.data.receivers.length<=1&&detail.data.shipments.length===0&&detail.data.order.items.length>0&&detail.data.order.items.every(i=>['N20','N21'].includes(i.status))} itemCodes={detail.data.order.items.map(i=>i.code)} refresh={()=>{void detail.refetch();void list.refetch();}}/>
    <p className="text-xs text-muted-foreground">카페24가 제공한 정보를 표시합니다. 개인정보 보관 기간이나 가림 처리에 따라 일부 정보가 표시되지 않을 수 있어요.</p>
   </>}</div></DialogContent></Dialog>
  </>}
 </div></AdminLayout>;
}
