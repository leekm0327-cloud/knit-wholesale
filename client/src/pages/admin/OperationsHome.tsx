import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { won, fmtDate } from '@/lib/format';
import type { Order, OrderItem } from '@shared/schema';

type Operations = {today:string;team:{id:number;staffId:number;name:string;startTime:string;endTime:string;position:string}[];stock:{productId:number;name:string;grams:number|null;minimumGrams:number|null;updatedAt:number|null;updatedBy:string}[];supply:{id:number;vendor:string;body:string;orderDate:string;status:string;expectedDate:string}[]};
const statusName:Record<string,string>={pending:'미처리',done:'처리 완료',cancelled:'취소',needed:'발주 필요',ordered:'입고 대기',partial:'일부 입고',refund_pending:'환불 대기'};
function snapshot(o:Order):{businessName?:string} {try {return JSON.parse(o.customerSnapshot)||{};}catch{return {};}}
function orderItems(o:Order):OrderItem[]{try{const v=JSON.parse(o.items);return Array.isArray(v)?v:[];}catch{return [];}}
const kstDate=(t:number)=>new Date(t+9*3600000).toISOString().slice(0,10);
function QueryState({query,children}:{query:{isError:boolean;isPending:boolean;refetch:()=>unknown};children:React.ReactNode}){return query.isError?<div className="erp-error" role="alert">데이터를 불러오지 못했습니다.<button onClick={()=>query.refetch()}>다시 시도</button></div>:query.isPending?<p className="erp-empty">불러오는 중…</p>:<>{children}</>;}
function Panel({title,href,children}:{title:string;href?:string;children:React.ReactNode}){return <section className="erp-panel"><div className="erp-panel-head"><h2>{title}</h2>{href&&<Link href={href}>전체 보기 →</Link>}</div>{children}</section>;}
export default function OperationsHome(){
 const {user}=useAuth();const {toast}=useToast();const enabled=user?.role==='admin';
 const oq=useQuery<Order[]>({queryKey:['/api/admin/orders'],enabled,refetchInterval:30000});
 const ops=useQuery<Operations>({queryKey:['/api/admin/operations'],enabled,refetchInterval:60000});
 const [selected,setSelected]=useState<Order|null>(null);
 const [filter,setFilter]=useState('전체');
 const [today,setToday]=useState(()=>kstDate(Date.now()));
 useEffect(()=>{const timer=window.setInterval(()=>setToday(kstDate(Date.now())),30000);return()=>clearInterval(timer);},[]);
 const seen=useRef<Set<number>|null>(null);
 useEffect(()=>{if(!oq.data)return;if(seen.current){const fresh=oq.data.filter(o=>!seen.current!.has(o.id));if(fresh.length){toast({title:'신규 주문',description:`${fresh.length}건의 새 주문이 접수되었습니다.`});if(typeof Notification!=='undefined'&&Notification.permission==='granted'){try{new Notification('니트커피 · 신규 주문',{body:`${fresh.length}건의 새 주문이 접수되었습니다.`});}catch{}}}}seen.current=new Set(oq.data.map(o=>o.id));},[oq.data,toast]);
 const scrollToSupply=()=>document.getElementById("operations-supply")?.scrollIntoView({behavior:"smooth",block:"start"});
 const orders=[...(oq.data||[])].sort((a,b)=>b.createdAt-a.createdAt);
 const pending=orders.filter(o=>o.status==='pending');
 const data=ops.data;
 const receipts=data?.supply.filter(s=>s.status==='ordered'||s.status==='partial')||[];
 const team=data?.today===today?data.team:[];
 const count=(error:boolean,loading:boolean,value:number)=>error?'확인 필요':loading?'—':String(value);
 return <AdminLayout><div className="erp-page"><div className="erp-page-heading"><div><small>DAILY OVERVIEW</small><h1>오늘</h1><p>{today.replaceAll('-','.')} · 니트커피 운영 현황</p></div><Link href="/admin/orders/new">주문 등록</Link></div>
 <div className="erp-stats">
 <Link href="/admin/orders"><small>오늘 접수 주문</small><strong>{count(oq.isError,oq.isPending,orders.filter(o=>kstDate(o.createdAt)===today&&o.status!=='cancelled').length)}</strong><em>취소 제외 · 내부 주문 포함</em></Link>
 <Link href="/admin/orders"><small>미처리 주문</small><strong>{count(oq.isError,oq.isPending,pending.length)}</strong><em>전체 기간</em></Link>
 <button type="button" onClick={scrollToSupply}><small>입고 대기</small><strong>{count(ops.isError,ops.isPending,receipts.length)}</strong><em>직원 발주 · 일부 입고 포함</em></button>
 <Link href="/admin/staff/schedule"><small>오늘 근무</small><strong>{count(ops.isError,ops.isPending||data?.today!==today,new Set(team.map(t=>t.staffId)).size)}</strong><em>근무표 기준 · 명</em></Link>
 </div>
 <div className="erp-columns"><div>
 <Panel title="확인할 일"><div className="erp-subnav" aria-label="업무 필터">{['전체','영업','구매'].map(f=><button className="erp-pill" aria-pressed={filter===f} style={{background:filter===f?'#252a31':undefined,color:filter===f?'white':undefined}} key={f} onClick={()=>setFilter(f)}>{f}</button>)}</div>
 {filter!=='구매'&&<QueryState query={oq}>{pending.length?<Link className="erp-task" href="/admin/orders"><span className="erp-pill warning">영업</span><div><strong>미처리 주문 {pending.length}건</strong><p>주문 내용과 희망 납품일을 확인해 주세요.</p></div><span>→</span></Link>:<p className="erp-empty">미처리 주문이 없습니다.</p>}</QueryState>}
 {filter!=='영업'&&<QueryState query={ops}>{data?.supply.length?<button type="button" className="erp-task w-full text-left" onClick={scrollToSupply}><span className="erp-pill">구매</span><div><strong>확인할 직원 발주 {data.supply.length}건</strong><p>발주 필요 · 입고 · 환불 대기</p></div><span>↓</span></button>:<p className="erp-empty">확인할 직원 발주가 없습니다.</p>}</QueryState>}
 </Panel>
 <Panel title="최근 주문" href="/admin/orders"><QueryState query={oq}>{orders.length?<div className="erp-table-wrap"><table className="erp-table"><thead><tr><th>거래처 / 주문</th><th className="erp-optional">접수일</th><th>상태</th><th>금액</th></tr></thead><tbody>{orders.slice(0,6).map(o=><tr key={o.id}><td><button onClick={()=>setSelected(o)}>{snapshot(o).businessName||'거래처 정보 없음'}</button><small>{o.orderNo}</small></td><td className="erp-optional">{fmtDate(o.createdAt)}</td><td><span className={'erp-pill '+(o.status==='pending'?'warning':'')}>{statusName[o.status]||o.status}</span></td><td>{won(o.totalAmount)}</td></tr>)}</tbody></table></div>:<p className="erp-empty">등록된 주문이 없습니다.</p>}</QueryState></Panel>
 <section id="operations-supply"><Panel title="직원 발주 진행 현황" href="/admin/staff/supply"><QueryState query={ops}>{data?.supply.length?data.supply.map(s=><div className="erp-task" key={s.id}><div><strong>{s.vendor||'구매처 미입력'} · {s.body}</strong><p>{s.orderDate} 기록{s.expectedDate?` · 입고 예정 ${s.expectedDate}`:''}</p></div><span className="erp-pill">{statusName[s.status]||s.status}</span></div>):<p className="erp-empty">진행 중인 발주가 없습니다.</p>}</QueryState></Panel></section>
 <Link className="erp-text-link" href="/admin/order-summary">도매 매출 · 거래처별 주문 요약 보기 →</Link>
 </div><aside className="erp-right">
 <Panel title="원두 재고"><QueryState query={ops}>{data?.stock.length?data.stock.map(s=><div className="erp-stock" key={s.productId}><div><strong>{s.name}</strong><p>{s.updatedAt?`${fmtDate(s.updatedAt)} · ${s.updatedBy}`:'아직 입력하지 않음'}</p>{s.grams!==null&&s.minimumGrams!==null&&s.grams<=s.minimumGrams&&<span className="erp-pill warning">기준 재고 이하</span>}</div><strong>{s.grams===null?'미입력':`${s.grams/1000} kg`}</strong></div>):<p className="erp-empty">직원 화면에서 관리할 원두를 추가하면 표시됩니다.</p>}</QueryState></Panel>
 <Panel title="오늘 함께 일하는 사람" href="/admin/staff/schedule"><QueryState query={ops}>{team.length?team.map(t=><div className="erp-worker" key={t.id}><div><strong>{t.name}</strong><p>{t.position||'담당 미지정'}</p></div><span>{t.startTime}–{t.endTime}</span></div>):<p className="erp-empty">오늘 등록된 근무가 없습니다.</p>}</QueryState></Panel>
 <div className="erp-integration"><strong>계좌 조회 · 전자세금계산서</strong><br/>팝빌 연동 준비 중<br/>현재 정산은 기존 메뉴에서 진행해 주세요.</div>
 </aside></div></div>
 <Sheet open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><SheetContent className="erp-admin erp-drawer" aria-describedby={undefined}><SheetTitle>주문 상세</SheetTitle>{selected&&<><h2>{snapshot(selected).businessName||'거래처 정보 없음'}</h2><p>{selected.orderNo}</p><div className="erp-detail-row"><span>상태</span>{statusName[selected.status]||selected.status}</div><div className="erp-detail-row"><span>희망 납품일</span>{selected.desiredDate||'미지정'}</div>{orderItems(selected).map((i,index)=><div className="erp-detail-row" key={index}><strong>{i.name} × {i.qty}</strong>{won(i.amount)}</div>)}<div className="erp-detail-row"><span>합계 · 부가세 포함</span><strong>{won(selected.totalAmount)}</strong></div>{selected.note&&<p className="erp-detail-note">{selected.note}</p>}<Link href={`/admin/orders/${selected.id}`} className="erp-detail-action">주문 관리 화면에서 열기 →</Link></>}</SheetContent></Sheet>
 </AdminLayout>;
}
