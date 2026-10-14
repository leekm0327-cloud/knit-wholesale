import bcrypt from 'bcryptjs';
import {z} from 'zod';
import type {SmartstoreConnection,SmartstoreOrder,SmartstoreDetail,SmartstoreOrderPage} from '../shared/smartstore';
import {smartstoreStatusNames} from '../shared/smartstore';
export class SmartstoreError extends Error{constructor(public code:string,message:string,public status=502){super(message);}}
export type SmartstoreConfig={clientId:string;clientSecret:string};
export function smartstoreConfig(env:NodeJS.ProcessEnv=process.env):SmartstoreConfig|null{
 const clientId=env.NAVER_COMMERCE_CLIENT_ID?.trim(),clientSecret=env.NAVER_COMMERCE_CLIENT_SECRET?.trim();
 if(!clientId&&!clientSecret)return null;
 if(!clientId||!clientSecret)throw new SmartstoreError('configuration','네이버 앱 ID와 시크릿을 모두 설정해 주세요.',503);
 if(!/^[A-Za-z0-9_-]{5,200}$/.test(clientId)||!/^\$2[aby]\$(0[4-9]|1[0-6])\$[./A-Za-z0-9]{22}$/.test(clientSecret))throw new SmartstoreError('configuration','네이버 커머스API 앱 ID·시크릿 형식을 확인해 주세요.',503);
 return {clientId,clientSecret};
}
const rec=z.record(z.unknown());
const txt=(v:unknown)=>typeof v==='string'?v:typeof v==='number'?String(v):'';
const obj=(v:unknown):Record<string,unknown>=>rec.safeParse(v).success?v as Record<string,unknown>:{};
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export const smartstoreId=z.string().regex(/^\d{8,25}$/);
export const smartstoreDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
export const smartstoreQuery=z.object({date:smartstoreDate,page:z.coerce.number().int().min(1).max(1000).default(1),status:z.string().refine(s=>Object.hasOwn(smartstoreStatusNames,s)).optional()});
export function normalizeSmartstoreOrder(raw:unknown):SmartstoreOrder{
 const root=obj(raw),p=obj(root.productOrder),o=obj(root.order);
 if(!smartstoreId.safeParse(p.productOrderId).success)throw new SmartstoreError('invalid_response','네이버 상품주문번호를 확인하지 못했습니다.');
 return {id:txt(p.productOrderId),orderId:txt(o.orderId),orderedAt:txt(o.orderDate),paidAt:txt(o.paymentDate),buyerName:txt(o.ordererName),name:txt(p.productName),option:txt(p.productOption),quantity:num(p.initialQuantity)??num(p.quantity),remainingQuantity:num(p.remainQuantity),amount:num(p.initialPaymentAmount)??num(p.totalPaymentAmount),remainingAmount:num(p.remainPaymentAmount),status:txt(p.productOrderStatus),placeStatus:txt(p.placeOrderStatus),shippingDueDate:txt(p.shippingDueDate),claimStatus:txt(p.claimStatus)};
}
export function createSmartstoreClient(config:SmartstoreConfig|null,fetcher:typeof fetch=fetch,now=()=>Date.now()){
 const origin='https://api.commerce.naver.com/external';
 let cached:{value:string;expires:number}|null=null,pending:Promise<string>|null=null,checkedAt='',lastError='';
 function conf(){if(!config)throw new SmartstoreError('not_configured','네이버 앱 등록과 서버 설정이 필요합니다.',503);return config;}
 async function request(path:string,init:RequestInit){try{return await fetcher(origin+path,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new SmartstoreError('network','네이버에 연결하지 못했습니다. 잠시 후 다시 조회해 주세요.',503);}}
 async function apiError(r:Response):Promise<never>{
  let code='';try{const body=await r.json();if(typeof body?.code==='string'&&/^[A-Z0-9_.-]{1,80}$/.test(body.code))code=body.code;}catch{}
  const messages:Record<number,string>={400:'네이버가 조회 조건 또는 인증 설정을 거절했습니다.',401:'네이버 인증에 실패했습니다. 앱 설정을 확인해 주세요.',403:'네이버 앱 권한과 API 호출 IP 등록을 확인해 주세요.',404:'해당 상품주문을 찾지 못했습니다.',429:'네이버 조회 요청이 많습니다. 잠시 후 다시 조회해 주세요.'};
  throw new SmartstoreError(code||'upstream',`${messages[r.status]||'네이버 조회가 일시적으로 실패했습니다.'} (HTTP ${r.status}${code?' · '+code:''})`,[400,401,403,404,429].includes(r.status)?r.status:502);
 }
 async function token(force=false,failedToken?:string):Promise<string>{
  const c=conf();
  if(failedToken&&cached&&cached.value!==failedToken&&cached.expires>now()+60000)return cached.value;
  if(!force&&cached&&cached.expires>now()+60000)return cached.value;
  if(!pending)pending=(async()=>{
   const timestamp=String(now());const signed=Buffer.from(await bcrypt.hash(`${c.clientId}_${timestamp}`,c.clientSecret)).toString('base64');
   const body=new URLSearchParams({client_id:c.clientId,timestamp,client_secret_sign:signed,grant_type:'client_credentials',type:'SELF'});
   const r=await request('/v1/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});
   if(!r.ok)await apiError(r);const raw=await r.json().catch(()=>null);
   const parsed=z.object({access_token:z.string().min(1),expires_in:z.number().int().min(61),token_type:z.string().optional()}).safeParse(raw);
   if(!parsed.success)throw new SmartstoreError('invalid_response','네이버 인증 응답을 확인하지 못했습니다.');
   cached={value:parsed.data.access_token,expires:now()+parsed.data.expires_in*1000};return cached.value;
  })().finally(()=>{pending=null;});
  return pending;
 }
 async function read(path:string,body?:unknown):Promise<any>{
  let access=await token();const send=()=>request(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let r=await send();
  if(r.status===401){const b=await r.clone().json().catch(()=>null);if(b?.code==='GW.AUTHN'){access=await token(true,access);r=await send();}}
  if(!r.ok)await apiError(r);const raw=await r.json().catch(()=>null);
  if(!raw||typeof raw!=='object')throw new SmartstoreError('invalid_response','네이버 응답을 읽지 못했습니다.');return raw;
 }
 async function checked<T>(fn:()=>Promise<T>):Promise<T>{try{const result=await fn();checkedAt=new Date(now()).toISOString();lastError='';return result;}catch(e){if(e instanceof SmartstoreError)lastError=e.message;throw e;}}
 return {
  status():SmartstoreConnection{return !config?{state:'not_configured',message:'네이버 커머스API 앱 등록과 고정 발신 IP 설정이 필요합니다.'}:lastError?{state:'error',message:lastError,checkedAt:checkedAt||undefined}:checkedAt?{state:'connected',message:'네이버 주문·배송 조회가 확인됐습니다.',checkedAt}:{state:'ready',message:'서버 설정이 준비됐습니다. 조회를 실행해 실제 연결을 확인해 주세요.'};},
  async list(input:unknown):Promise<SmartstoreOrderPage>{const q=smartstoreQuery.parse(input);return checked(async()=>{
   const pageSize=50,params=new URLSearchParams({from:q.date+'T00:00:00.000+09:00',to:q.date+'T23:59:59.999+09:00',rangeType:'PAYED_DATETIME',pageSize:String(pageSize),page:String(q.page),quantityClaimCompatibility:'true',...(q.status?{productOrderStatuses:q.status}:{})});
   const raw=await read('/v1/pay-order/seller/product-orders?'+params);
   const contents=z.array(rec).safeParse(raw.data?.contents);if(!contents.success)throw new SmartstoreError('invalid_response','네이버 주문 목록을 읽지 못했습니다.');
   const orders=contents.data.map(row=>normalizeSmartstoreOrder(row.content));
   const pagination=obj(raw.data?.pagination);
   const hasMore=typeof pagination.hasNext==='boolean'?pagination.hasNext:typeof pagination.totalPages==='number'?q.page<pagination.totalPages:orders.length===pageSize;
   return {orders,date:q.date,page:q.page,pageSize,hasMore,fetchedAt:new Date(now()).toISOString()};
  });},
  async detail(input:unknown):Promise<SmartstoreDetail>{const id=smartstoreId.parse(input);return checked(async()=>{
   // Naver defines this POST as a read-only query, never an order mutation.
   const raw=await read('/v1/pay-order/seller/product-orders/query',{productOrderIds:[id],quantityClaimCompatibility:true});
   const data=z.array(rec).safeParse(raw.data);if(!data.success)throw new SmartstoreError('invalid_response','네이버 주문 상세를 읽지 못했습니다.');
   const root=data.data.find(x=>txt(obj(x.productOrder).productOrderId)===id);if(!root)throw new SmartstoreError('not_found','해당 상품주문을 찾지 못했습니다. 번호와 조회 권한을 확인해 주세요.',404);
   const p=obj(root.productOrder),address=obj(p.shippingAddress),delivery=obj(root.delivery);
   return {order:normalizeSmartstoreOrder(root),recipient:{name:txt(address.name),phones:[txt(address.tel1),txt(address.tel2)].filter(Boolean),zipcode:txt(address.zipCode),address:[txt(address.baseAddress),txt(address.detailedAddress)].filter(Boolean).join(' '),message:txt(p.shippingMemo)},delivery:{carrier:txt(delivery.deliveryCompany),trackingNo:txt(delivery.trackingNumber),status:txt(delivery.deliveryStatus),sentAt:txt(delivery.sendDate),deliveredAt:txt(delivery.deliveredDate),wrongTracking:delivery.isWrongTrackingNumber===true},hasClaims:Object.keys(obj(root.currentClaim)).length>0||(Array.isArray(root.completedClaims)&&root.completedClaims.length>0),fetchedAt:new Date(now()).toISOString()};
  });}
 };
}
