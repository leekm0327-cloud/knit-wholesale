/** Read-only Cafe24 DTOs. No wholesale order IDs or financial ledger writes. */
export type Cafe24Connection = {
  state: 'not_configured' | 'not_connected' | 'connected' | 'reauthorize' | 'error';
  canWrite?:boolean; mallId: string; shopNo: number; message: string;
};
export type Cafe24Item = {code:string; name:string; option:string; quantity:number|null; status:string; statusText:string; shippingCode:string};
export type Cafe24Order = {
  id:string; orderedAt:string; currency:string; amount:string|null; paid:string; cancelled:string;
  buyerName:string; items:Cafe24Item[];
};
export type Cafe24Receiver = {shippingCode:string; name:string; phone:string; cellphone:string; zipcode:string; address:string; message:string};
export type Cafe24Shipment = {code:string; trackingNo:string; carrierCode:string; status:string; itemCodes:string[]};
export type Cafe24OrderPage = {orders:Cafe24Order[]; page:number; pageSize:number; hasMore:boolean; fetchedAt:string};
export type Cafe24OrderDetail = {order:Cafe24Order; receivers:Cafe24Receiver[]; shipments:Cafe24Shipment[]; fetchedAt:string};
export const cafe24StatusNames: Record<string,string> = {
 N00:'입금 전',N10:'상품 준비 중',N20:'배송 준비 중',N21:'배송 대기',N22:'배송 보류',N30:'배송 중',N40:'배송 완료',N50:'구매 확정',
 C00:'취소 신청',C10:'취소 접수',C34:'취소 처리 중',C40:'취소 완료',C47:'입금 전 취소',C48:'입금 전 자동 취소',C49:'입금 전 관리자 취소',
 R00:'반품 신청',R10:'반품 접수',R30:'반품 처리 중',R40:'반품 완료',E00:'교환 신청',E10:'교환 접수',E20:'교환 준비',E30:'교환 처리 중',E40:'교환 완료',
};

export const cafe24Carriers:Record<string,string>={"0006":"CJ대한통운","0019":"롯데택배","0018":"한진택배","0004":"로젠택배","0012":"우체국택배","0043":"대신택배","0016":"일양로지스","0062":"GS택배"};
