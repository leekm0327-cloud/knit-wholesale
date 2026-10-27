export type CustomerShipping = { carrier: string; tracking: string; state: 'registered' | 'dispatch_confirmed' | 'review_required' };
export const carrierNames: Record<string,string> = {CJ:'CJ대한통운',HANJIN:'한진택배',LOTTE:'롯데택배',POST:'우체국택배',LOGEN:'로젠택배'};
// Official lookup pages; do not infer shipment progress or send numbers automatically.
export const carrierLookup: Record<string,string> = {CJ:'https://www.cjlogistics.com/ko/tool/parcel/tracking',HANJIN:'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038',LOTTE:'https://www.lotteglogis.com/home/reservation/tracking/index',POST:'https://service.epost.go.kr/iservice/usr/trace/usrtrc001k01.jsp',LOGEN:'https://www.ilogen.com/web/personal/trace'};
