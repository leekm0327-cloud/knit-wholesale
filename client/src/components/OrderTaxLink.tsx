import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/lib/auth';
const labels:Record<string,string>={unissued:'미발행',draft:'발행 준비',issued:'발행 완료',sending:'발행 중',unknown:'확인 필요',rejected:'발행 실패',changed:'주문 변경 · 확인 필요',external:'기존 발행 기록'};
export function OrderTaxLink({orderId}:{orderId?:number}){
 const {user}=useAuth(),owner=(user as any)?.adminRole==='owner';
 const q=useQuery<any>({queryKey:['/api/admin/tax-invoices/production/orders'],enabled:owner&&!!orderId,staleTime:0});
 if(!owner)return null;const row=q.data?.rows.find((r:any)=>r.id===orderId);
 return <div className="no-print my-3 text-sm"><a className="border rounded px-3 py-2 inline-block" href={'?environment=production'+(orderId?'&order='+orderId:'')+'#/admin/tax-invoices'}>{orderId?'이 주문 세금계산서':'미발행 주문 · 일괄 발행'}</a>{orderId&&<span className="ml-3">{q.isLoading?'상태 확인 중…':q.isError?'상태 조회 실패':row?labels[row.state]||row.state:'처리 완료 후 발행 가능'}</span>}</div>;
}
