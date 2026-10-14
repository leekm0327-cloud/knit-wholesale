import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {AdminLayout} from '@/components/AdminLayout';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/lib/auth';
import {apiRequest} from '@/lib/queryClient';
import {useReviewAlert,reviewKey} from '@/hooks/use-review-alert';
export default function AdminReviewAlerts(){
 const query=useReviewAlert(),cache=useQueryClient(),{user}=useAuth();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const data=query.data,ready=data?.state==='ready'&&!query.isError;
 const oauthError=new URLSearchParams(window.location.search).get('cafe24_connection_error');
 async function connect(){setBusy(true);setError('');try{const r=await apiRequest('POST','/api/admin/cafe24/connect',{reviews:true});window.location.assign((await r.json()).url);}catch(e){setError(e instanceof Error?e.message:'연결을 시작하지 못했습니다.');setBusy(false);}}
 async function acknowledge(){if(!data)return;setBusy(true);setError('');try{const r=await apiRequest('POST','/api/admin/cafe24/reviews/acknowledge',{through:data.through});cache.setQueryData(reviewKey,await r.json());}catch(e){setError(e instanceof Error?e.message:'확인 표시를 저장하지 못했습니다.');}finally{setBusy(false);}}
 return <AdminLayout><div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-7">
  <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">새 리뷰</h1><p className="mt-2 text-sm text-muted-foreground">새 리뷰가 도착했는지만 간단히 확인하세요.</p></div><Button variant="outline" disabled={query.isFetching||busy} onClick={()=>void query.refetch()}>새로고침</Button></div>
  {(error||oauthError)&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-900">{error||'리뷰 조회 권한 연결이 완료되지 않았어요. 개발자센터 권한을 확인한 뒤 다시 연결해 주세요.'}</p>}
  <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">자사몰 · 카페24</h2>
   {query.isPending&&<p role="status">리뷰 연결을 확인하고 있어요.</p>}
   {query.isError&&<p role="alert" className="text-sm text-red-800">{query.error.message} 새 리뷰가 없는 것으로 처리하지 않았어요.</p>}
   {ready&&<><p role="status" className="text-2xl font-semibold">{data.unread>0?`새 리뷰 ${data.unread}건`:'확인할 새 리뷰가 없어요'}</p><div className="flex flex-wrap gap-2"><Button disabled={busy||data.unread===0} onClick={acknowledge}>확인했어요</Button><Button asChild variant="outline"><a href="https://knitcoffee00.cafe24.com/board/product/list.html?board_no=4" target="_blank" rel="noopener noreferrer">리뷰 게시판 보기</a></Button></div>
    <p className="text-xs leading-6 text-muted-foreground">마지막 조회: {data.checkedAt?new Date(data.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—'}<br/>관리자 화면을 열어둔 동안 1분 간격으로 확인해요. 처음 연결할 때 있던 리뷰는 새 리뷰에 포함하지 않아요.<br/>‘확인했어요’는 모든 관리자에게 함께 적용되며, 리뷰 원문에는 영향을 주지 않아요.</p></>}
   {data&&!query.isError&&data.state!=='ready'&&<><p className="text-sm">{data.message}</p>{(user as any)?.adminRole==='owner'?<Button disabled={busy} onClick={connect}>리뷰 조회 연결</Button>:<p className="text-sm text-muted-foreground">대표 관리자에게 리뷰 조회 연결을 요청해 주세요.</p>}<p className="text-xs text-muted-foreground">게시판 읽기 권한만 추가해요. 답글 등록 기능은 포함하지 않아요.</p></>}
  </section>
  <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-semibold">스마트스토어</h2><p className="text-sm">자동 확인 미지원</p><p className="text-sm text-muted-foreground">현재 연결된 네이버 API에서는 새 리뷰를 확인할 수 없어요. 판매자센터에서 확인해 주세요.</p><Button asChild variant="outline"><a href="https://sell.smartstore.naver.com/#/review/search" target="_blank" rel="noopener noreferrer">스마트스토어 리뷰 보기</a></Button></section>
 </div></AdminLayout>;
}
