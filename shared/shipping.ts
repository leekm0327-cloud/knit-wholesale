import { normalizeTrackingNumber, type DispatchSummary } from './roastery-dispatch';

export type CustomerDispatch = {
  state: 'partial_dispatch' | 'fully_dispatched';
  consignments: DispatchSummary['consignments'];
};

export type CustomerShipping =
  | { carrier: string; tracking: string; state: 'registered' | 'dispatch_confirmed' | 'review_required' | 'dispatch_review_required' }
  | CustomerDispatch;

export function isCustomerDispatch(shipping?: CustomerShipping | null): shipping is CustomerDispatch {
  return !!shipping && 'consignments' in shipping;
}

export function shipmentMethodLabel(shipment: CustomerDispatch['consignments'][number]) {
  if (shipment.method === 'quick') return '퀵';
  if (shipment.method === 'direct') return '직접배송';
  return carrierNames[shipment.carrier] || '택배';
}
export function shipmentTrackingNumbers(shipment: { method: string; tracking: string; trackings?: string[] }): string[] {
  if (shipment.method !== 'parcel') return [];
  return shipment.trackings?.length ? shipment.trackings : shipment.tracking ? [shipment.tracking] : [];
}

export function normalizeOrderTracking(value: string): string {
  const number = normalizeTrackingNumber(value);
  return /^\d*$/.test(number) ? number : value.trim();
}

export const carrierNames: Record<string,string> = {CJ:'CJ대한통운',HANJIN:'한진택배',LOTTE:'롯데택배',POST:'우체국택배',LOGEN:'로젠택배'};
// Official carrier lookup pages, with a Korean shipment-specific URL for validated CJ numbers.
export const carrierLookup: Record<string,string> = {CJ:'https://www.cjlogistics.com/ko/tool/parcel/tracking',HANJIN:'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038',LOTTE:'https://www.lotteglogis.com/home/reservation/tracking/index',POST:'https://service.epost.go.kr/iservice/usr/trace/usrtrc001k01.jsp',LOGEN:'https://www.ilogen.com/web/personal/trace'};

export function carrierTrackingLink(carrier: string, tracking: string): { url: string; direct: boolean } | null {
  if (!Object.hasOwn(carrierLookup, carrier)) return null;
  const url = carrierLookup[carrier];
  const number = normalizeTrackingNumber(tracking);
  if (carrier !== 'CJ' || !/^(?:[0-9]{10}|[0-9]{12})$/.test(number)) return { url, direct: false };

  const trackingUrl = new URL(url);
  trackingUrl.searchParams.set('gnbInvcNo', number);
  return { url: trackingUrl.toString(), direct: true };
}
