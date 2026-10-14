import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/lib/auth';
import {API_BASE} from '@/lib/queryClient';
import type {ReviewAlert} from '@shared/review-alerts';
export const reviewKey=['/api/admin/cafe24/reviews/summary'];
export function useReviewAlert(){
 const {user}=useAuth();
 return useQuery<ReviewAlert>({queryKey:reviewKey,enabled:user?.role==='admin',queryFn:async({signal})=>{
  const r=await fetch(API_BASE+reviewKey[0],{credentials:'include',cache:'no-store',signal});
  const body=await r.json();if(!r.ok)throw Error(body.message||'리뷰 확인에 실패했습니다.');return body;
 },staleTime:60000,refetchInterval:60000,refetchIntervalInBackground:false,retry:false});
}
