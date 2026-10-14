export const smartstoreStatusNames:Record<string,string>={PAYMENT_WAITING:'결제 대기',PAYED:'결제 완료',DELIVERING:'배송 중',DELIVERED:'배송 완료',PURCHASE_DECIDED:'구매 확정',EXCHANGED:'교환',CANCELED:'취소',RETURNED:'반품',CANCELED_BY_NOPAYMENT:'미결제 취소'};
export type SmartstoreConnection={state:'not_configured'|'ready'|'connected'|'error';message:string;checkedAt?:string};
export type SmartstoreOrder={id:string;orderId:string;orderedAt:string;paidAt:string;buyerName:string;name:string;option:string;quantity:number|null;remainingQuantity:number|null;amount:number|null;remainingAmount:number|null;status:string;placeStatus:string;shippingDueDate:string;claimStatus:string};
export type SmartstoreDetail={order:SmartstoreOrder;recipient:{name:string;phones:string[];zipcode:string;address:string;message:string};delivery:{carrier:string;trackingNo:string;status:string;sentAt:string;deliveredAt:string;wrongTracking:boolean};hasClaims:boolean;fetchedAt:string};
export type SmartstoreOrderPage={orders:SmartstoreOrder[];date:string;page:number;pageSize:number;hasMore:boolean;fetchedAt:string};

export const smartstoreCarriers:Record<string,string>={CJGLS:'CJ대한통운',HYUNDAI:'롯데택배',HANJIN:'한진택배',KGB:'로젠택배',EPOST:'우체국택배',KDEXP:'경동택배',DAESIN:'대신택배',ILYANG:'일양로지스',CVSNET:'GS택배',CUPARCEL:'CU택배'};
export type OrderActionResult={id:string;outcome:'success'|'failed'|'unknown';message:string};
export type SmartstoreRangePage={orders:SmartstoreOrder[];next:{date:string;page:number}|null;fetchedAt:string};
