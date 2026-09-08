import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { errMsg, won } from '@/lib/format';
import { FeatureShell, LoadState, monthNow, monthRange } from './FeatureUI';
import type { Performance, Sharing } from '@shared/workspace-features';
export default function StorePerformance({staff=false}:{staff?:boolean}) {
 const {user}=useAuth();const owner=(user as any)?.adminRole==='owner';const [month,setMonth]=useState(monthNow),[draft,setDraft]=useState<Sharing|null>(null),[busy,setBusy]=useState(false);const {toast}=useToast();const {from,to}=monthRange(month);
 const q=useQuery<Performance&{shared?:boolean}>({queryKey:[staff?'/api/staff/store-performance':'/api/admin/store-performance',month],enabled:staff||owner,staleTime:0,refetchInterval:60000,queryFn:async()=>(await apiRequest('GET',`${staff?'/api/staff':'/api/admin'}/store-performance?from=${from}&to=${to}`)).json()});
 const settings=useQuery<Sharing>({queryKey:['/api/admin/performance-sharing'],enabled:!staff&&owner});
 const data=q.data;const flags=draft||settings.data;
 async function save(){if(!flags||busy)return;setBusy(true);try{await apiRequest('PUT','/api/admin/performance-sharing',flags);await settings.refetch();setDraft(null);toast({title:'직원 공개 항목을 저장했어요.'});}catch(e){toast({variant:'destructive',title:errMsg(e)});}finally{setBusy(false);}}
 if(!staff&&user&&!owner)return <FeatureShell title="매장 성과 요약"><p className="f-card">대표 계정에서 확인할 수 있습니다.</p></FeatureShell>;
 const days=data?.weekdays||[];const avg=(d:typeof days[number])=>d.days?((d.amount??d.qty??0)/d.days):0;const max=Math.max(...days.map(avg),1);
 return <FeatureShell staff={staff} title="매장 성과 요약"><div className="f-card"><label>조회 월<input type="month" value={month} onChange={e=>e.target.value&&setMonth(e.target.value)}/></label><p className="f-muted">업로드된 POS 상품 판매 데이터 기준입니다. 판매 수량은 주문 건수나 방문객 수가 아닙니다.</p>{data?.coverage&&<p className="f-muted">전체 등록 범위 {data.coverage.from} ~ {data.coverage.to}</p>}{!staff&&<Link className="f-button mt-3" href="/admin/pos-sales">POS 데이터 관리</Link>}</div>
 <LoadState query={q}/>{data?.shared===false?<p className="f-card">아직 직원에게 공개된 성과 항목이 없습니다.</p>:data&&<>
 <div className="f-grid">{data.amount!==undefined&&<section className="f-card"><h2>POS 판매금액</h2><strong className="f-number">{won(data.amount)}</strong></section>}{data.qty!==undefined&&<section className="f-card"><h2>상품 판매 수량</h2><strong className="f-number">{data.qty.toLocaleString()}개</strong></section>}</div>
 <p className="f-muted mb-4">선택 기간에 판매 데이터가 등록된 날: {data.days}일{data.days===0?' · 아직 데이터가 없습니다.':''}</p>
 {data.products&&<section className="f-card"><h2>상품별 판매</h2><p className="f-muted mb-2">{data.qty!==undefined?'판매 수량 순':data.amount!==undefined?'판매금액 순':'상품명 순'}</p><div className="overflow-x-auto"><table className="f-table"><thead><tr><th>상품</th>{data.qty!==undefined&&<th>수량</th>}{data.amount!==undefined&&<th>판매금액</th>}</tr></thead><tbody>{data.products.map((p,i)=><tr key={p.category+p.product}><td>{i+1}. {p.product}<div className="f-muted">{p.category}</div></td>{p.qty!==undefined&&<td>{p.qty.toLocaleString()}</td>}{p.amount!==undefined&&<td className="whitespace-nowrap">{won(p.amount)}</td>}</tr>)}</tbody></table></div></section>}
 {data.weekdays&&<section className="f-card"><h2>요일별 흐름</h2><p className="f-muted mb-3">{data.amount!==undefined?'등록일 평균 판매금액':data.qty!==undefined?'등록일 평균 판매 수량':'판매 데이터 등록일 수'} · 미등록 날짜는 계산에서 제외됩니다.</p>{days.map(d=><div className="f-chart-row" key={d.weekday}><span>{'일월화수목금토'[d.weekday]}요일</span><div>{data.amount!==undefined||data.qty!==undefined?<i style={{width:Math.max(0,avg(d))/max*100+'%'}}/>:<span>{d.days}일</span>}</div><span className="text-right">{!d.days?'미등록':data.amount!==undefined?won(Math.round(avg(d))):data.qty!==undefined?avg(d).toFixed(1)+'개':d.days+'일'}</span></div>)}</section>}
 </>}
 {!staff&&owner&&<section className="f-card"><h2>직원에게 보여줄 항목</h2><LoadState query={settings}/>{flags&&<fieldset disabled={busy}>{([['revenue','판매금액'],['quantity','판매 수량'],['products','상품별 목록'],['weekdays','요일별 흐름']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={flags[key]} onChange={e=>setDraft({...flags,[key]:e.target.checked})}/>{label}</label>)}<p className="f-muted mb-3">상품·요일별 숫자도 위에서 선택한 판매금액·수량만 공개됩니다. 비용·이익·미수금은 공유하지 않습니다. 처음에는 모두 비공개입니다.</p><button className="f-primary" onClick={save}>{busy?'저장 중…':'공개 설정 저장'}</button></fieldset>}</section>}
 </FeatureShell>;
}
export function StaffStorePerformance(){return <StorePerformance staff/>;}
