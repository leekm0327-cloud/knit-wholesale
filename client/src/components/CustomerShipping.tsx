import {
  carrierNames,
  carrierTrackingLink,
  isCustomerDispatch,
  shipmentMethodLabel,
  type CustomerShipping as Shipping,
} from '@shared/shipping';
import { fmtDateTime } from '@/lib/format';

function TrackingLink({ carrier, tracking }: { carrier: string; tracking: string }) {
  const link = carrierTrackingLink(carrier, tracking);
  if (!link) return null;
  return (
    <a className="inline-flex min-h-11 items-center underline" href={link.url}
      target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      {link.direct ? 'CJ대한통운 배송조회' : '택배사 배송조회 · 번호 입력'}
    </a>
  );
}

export function CustomerShipping({ shipping, compact = false }: { shipping?: Shipping | null; compact?: boolean }) {
  if (!shipping) return null;
  if (isCustomerDispatch(shipping)) {
    const { consignments } = shipping;
    const status = shipping.state === 'partial_dispatch' ? '부분출고' : '출고 완료';
    if (compact) {
      return (
        <p className="col-span-full my-1 text-sm">
          <strong>{status}</strong> · {consignments.length === 1 ? shipmentMethodLabel(consignments[0]) : `${consignments.length}회 출고`}
        </p>
      );
    }
    return (
      <section className="mb-6 space-y-3 text-sm" aria-label="출고 내역">
        <h2 className="font-semibold">{status}</h2>
        <ol className="divide-y border-y">
          {consignments.map((delivery, index) => (
            <li key={delivery.id} className="py-3">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <strong>{index + 1}차 출고 · {shipmentMethodLabel(delivery)}</strong>
                <time className="text-xs text-muted-foreground" dateTime={new Date(delivery.createdAt).toISOString()}>
                  {fmtDateTime(delivery.createdAt)}
                </time>
              </p>
              {delivery.method === 'parcel' && delivery.tracking && (
                <div className="flex flex-wrap items-center gap-x-3">
                  <span className="break-all">송장번호 <strong className="tabular-nums">{delivery.tracking}</strong></span>
                  <TrackingLink carrier={delivery.carrier} tracking={delivery.tracking} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    );
  }
  if (shipping.state === 'review_required' || shipping.state === 'dispatch_review_required') {
    return <p className="col-span-full my-2 text-sm" role="status">{shipping.state === 'review_required' ? '송장 정보 확인 중' : '출고 정보 확인 중'}</p>;
  }
  return (
    <section className="col-span-full my-3 text-sm break-all" aria-label="송장 정보">
      <p>{shipping.state === 'dispatch_confirmed' ? '출고 확인' : '송장 등록'} · {carrierNames[shipping.carrier] || '택배사 확인 필요'} <strong className="tabular-nums">{shipping.tracking}</strong></p>
      <p className="mt-1 text-xs text-muted-foreground">송장 등록은 집하·배송 완료를 의미하지 않습니다.</p>
      <TrackingLink carrier={shipping.carrier} tracking={shipping.tracking} />
    </section>
  );
}
