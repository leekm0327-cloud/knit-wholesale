import {carrierNames,carrierLookup,type CustomerShipping as Shipping} from '@shared/shipping';
export function CustomerShipping({shipping}:{shipping?:Shipping|null}){
 if(!shipping)return null;
 if(shipping.state==='review_required')return <p className="my-2 text-sm" role="status">송장 정보 확인 중</p>;
 return <section className="my-3 text-sm break-all" aria-label="송장 정보"><p>{shipping.state==='dispatch_confirmed'?'출고 확인':'송장 등록'} · {carrierNames[shipping.carrier]||'택배사 확인 필요'} <strong className="tabular-nums">{shipping.tracking}</strong></p><p className="mt-1 text-xs text-muted-foreground">송장 등록은 집하·배송 완료를 의미하지 않습니다.</p>{carrierLookup[shipping.carrier]&&<a className="inline-flex min-h-11 items-center underline" href={carrierLookup[shipping.carrier]} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">택배사 배송조회 · 번호 입력</a>}</section>;
}
