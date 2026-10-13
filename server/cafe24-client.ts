import type Database from 'better-sqlite3';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Cafe24Connection,Cafe24Order,Cafe24OrderDetail,Cafe24OrderPage} from '../shared/cafe24';

export class Cafe24Error extends Error {
 constructor(public code:string,message:string,public status=502){super(message);}
}
export type Cafe24Config = {mallId:string;shopNo:number;clientId:string;clientSecret:string;redirectUri:string;encryptionKey:Buffer;version:string};
export function cafe24Config(env:NodeJS.ProcessEnv=process.env):Cafe24Config|null {
 const required=['CAFE24_MALL_ID','CAFE24_CLIENT_ID','CAFE24_CLIENT_SECRET','CAFE24_REDIRECT_URI','CAFE24_TOKEN_KEY'];
 if(required.some(k=>!env[k]?.trim()))return null;
 const mallId=env.CAFE24_MALL_ID!.trim();
 const key=env.CAFE24_TOKEN_KEY!.trim();
 const encryptionKey=Buffer.from(key,'base64');
 const shopNo=Number(env.CAFE24_SHOP_NO||1);
 let uri:URL;
 try{uri=new URL(env.CAFE24_REDIRECT_URI!);}catch{throw new Cafe24Error('configuration','카페24 연결 설정을 확인해 주세요.',503);}
 const local=env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(uri.hostname);
 if(!/^[a-z0-9][a-z0-9-]{0,49}$/.test(mallId))throw new Cafe24Error('configuration','CAFE24_MALL_ID에 쇼핑몰 아이디만 입력해 주세요.',503);
 if(!Number.isSafeInteger(shopNo)||shopNo<1)throw new Cafe24Error('configuration','CAFE24_SHOP_NO에 1 이상의 쇼핑몰 번호를 입력해 주세요.',503);
 if(encryptionKey.length!==32||encryptionKey.toString('base64')!==key)throw new Cafe24Error('configuration','CAFE24_TOKEN_KEY 형식이 맞지 않습니다. 무작위 32바이트를 base64로 변환한 값만 입력해 주세요.',503);
 if((uri.protocol!=='https:'&&!(local&&uri.protocol==='http:'))||uri.username||uri.password||uri.search||uri.hash||uri.pathname!=='/api/admin/cafe24/callback')
  throw new Cafe24Error('configuration','CAFE24_REDIRECT_URI의 HTTPS 주소와 /api/admin/cafe24/callback 경로를 확인해 주세요.',503);
 return {mallId,shopNo,clientId:env.CAFE24_CLIENT_ID!.trim(),clientSecret:env.CAFE24_CLIENT_SECRET!,redirectUri:uri.href,encryptionKey,version:'2026-06-01'};
}
const text=(v:unknown)=>typeof v==='string'?v:typeof v==='number'?String(v):'';
const record=z.record(z.unknown());
const rows=z.array(record);
const tokenSchema=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_at:z.string(),refresh_token_expires_at:z.string(),mall_id:z.string(),client_id:z.string(),scopes:z.array(z.string())});
type Token=z.infer<typeof tokenSchema>;
export const cafe24Date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
export const cafe24OrderId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
export const cafe24Query=z.object({
 start:cafe24Date,end:cafe24Date,page:z.coerce.number().int().min(1).max(300).default(1),
 orderId:cafe24OrderId.optional(),status:z.string().regex(/^[NCRE]\d{2}$/).optional(),
}).refine(q=>{const span=Date.parse(q.end)-Date.parse(q.start);return span>=0&&span<90*86400000;},'조회 기간은 최대 90일입니다.');
function readRows(value:unknown){const parsed=rows.safeParse(value);if(!parsed.success)throw new Cafe24Error('invalid_response','카페24 응답을 읽지 못했습니다. 잠시 후 다시 조회해 주세요.');return parsed.data;}
function normalizeOrder(o:Record<string,unknown>):Cafe24Order {
 if(!text(o.order_id))throw new Cafe24Error('invalid_response','카페24 주문번호를 확인하지 못했습니다.');
 const buyer=record.safeParse(o.buyer);const items=readRows(o.items);
 const amount=o.payment_amount;
 return {id:text(o.order_id),orderedAt:text(o.order_date),currency:text(o.currency)||'KRW',amount:amount!==null&&amount!==undefined&&/^\d+(\.\d+)?$/.test(text(amount))?text(amount):null,
 paid:text(o.paid),cancelled:text(o.canceled),buyerName:buyer.success?text(buyer.data.name):'',
 items:items.map(i=>({code:text(i.order_item_code),name:text(i.product_name),option:text(i.option_value),quantity:i.quantity!=null&&Number.isFinite(Number(i.quantity))?Number(i.quantity):null,status:text(i.order_status),statusText:text(i.order_status_text),shippingCode:text(i.shipping_code)}))};
}
/** Dependencies are injectable so tests never access a live mall or production DB. */
export function createCafe24Client(db:Database.Database,config:Cafe24Config|null,fetcher:typeof fetch=fetch,now=()=>Date.now()){
 db.exec('CREATE TABLE IF NOT EXISTS cafe24_connection (mall_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, encrypted_token TEXT NOT NULL, updated_at INTEGER NOT NULL)');
 let refreshing:Promise<Token>|null=null;
 const conf=()=>{if(!config)throw new Cafe24Error('not_configured','카페24 앱 연결 준비가 필요합니다.',503);return config;};
 const origin=()=>`https://${conf().mallId}.cafe24api.com`;
 function saveToken(raw:unknown){
  const c=conf();const result=tokenSchema.safeParse(raw);
  if(!result.success)throw new Cafe24Error('invalid_token','카페24 인증 응답을 확인하지 못했습니다. 다시 연결해 주세요.');
  const t=result.data;
  if(t.mall_id!==c.mallId||t.client_id!==c.clientId||!t.scopes.includes('mall.read_order')||!Number.isFinite(Date.parse(t.expires_at))||!Number.isFinite(Date.parse(t.refresh_token_expires_at)))
   throw new Cafe24Error('invalid_token','쇼핑몰 또는 주문 조회 권한이 일치하지 않습니다. 다시 연결해 주세요.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',c.encryptionKey,iv);
  cipher.setAAD(Buffer.from(c.mallId+':'+c.clientId));
  const data=Buffer.concat([cipher.update(JSON.stringify(t),'utf8'),cipher.final()]);
  const encrypted=[iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
  db.prepare('INSERT INTO cafe24_connection VALUES (?,?,?,?) ON CONFLICT(mall_id) DO UPDATE SET client_id=excluded.client_id,encrypted_token=excluded.encrypted_token,updated_at=excluded.updated_at').run(c.mallId,c.clientId,encrypted,now());
  return t;
 }
 function loadToken():Token|null {
  const c=conf();const row=db.prepare('SELECT encrypted_token FROM cafe24_connection WHERE mall_id=? AND client_id=?').get(c.mallId,c.clientId) as {encrypted_token:string}|undefined;
  if(!row)return null;
  try{const [iv,tag,data]=row.encrypted_token.split('.').map(s=>Buffer.from(s,'base64'));const dec=createDecipheriv('aes-256-gcm',c.encryptionKey,iv);dec.setAAD(Buffer.from(c.mallId+':'+c.clientId));dec.setAuthTag(tag);return tokenSchema.parse(JSON.parse(Buffer.concat([dec.update(data),dec.final()]).toString('utf8')));}
  catch{throw new Cafe24Error('token_storage','저장된 카페24 연결을 확인할 수 없습니다. 연결 설정을 확인해 주세요.',503);}
 }
 function status():Cafe24Connection {
  const base={mallId:config?.mallId||'',shopNo:config?.shopNo||1};
  if(!config)return {...base,state:'not_configured',message:'카페24 앱 등록과 서버 연결 설정이 필요합니다.'};
  try{const t=loadToken();if(!t)return {...base,state:'not_connected',message:'카페24에서 주문 조회 연결을 승인해 주세요.'};
   if(Date.parse(t.refresh_token_expires_at)<=now())return {...base,state:'reauthorize',message:'카페24 연결이 만료됐습니다. 다시 연결해 주세요.'};
   return {...base,state:'connected',message:'카페24 주문과 배송정보를 조회할 수 있습니다.'};
  }catch{return {...base,state:'error',message:'저장된 연결 설정을 확인해 주세요.'};}
 }
 async function request(url:string,options:RequestInit):Promise<Response>{
  try{return await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch{throw new Cafe24Error('network','카페24에 연결하지 못했습니다. 잠시 후 다시 조회해 주세요.',503);}
 }
 async function tokenRequest(params:URLSearchParams):Promise<Token>{
  const c=conf();const r=await request(origin()+'/api/v2/oauth/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(c.clientId+':'+c.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});
  if(!r.ok)throw new Cafe24Error(r.status===429?'rate_limit':'reauthorize',r.status===429?'카페24 인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.':'카페24 연결을 다시 승인해 주세요.',r.status===429?429:409);
  let body:unknown;try{body=await r.json();}catch{throw new Cafe24Error('invalid_token','카페24 인증 응답을 확인하지 못했습니다.');}
  return saveToken(body);
 }
 async function accessToken(force=false,failedToken?:string):Promise<Token>{
  const t=loadToken();if(!t)throw new Cafe24Error('not_connected','카페24 연결 승인이 필요합니다.',409);
  if(failedToken&&t.access_token!==failedToken)return t;
  if(!force&&Date.parse(t.expires_at)>now()+60000)return t;
  if(Date.parse(t.refresh_token_expires_at)<=now())throw new Cafe24Error('reauthorize','카페24 연결이 만료됐습니다. 다시 연결해 주세요.',409);
  if(!refreshing)refreshing=tokenRequest(new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh_token})).finally(()=>{refreshing=null;});
  return refreshing;
 }
 async function get(path:string,params:Record<string,string>={}){
  const c=conf(),url=new URL('/api/v2/admin/'+path,origin());
  url.searchParams.set('shop_no',String(c.shopNo));Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
  let token=await accessToken();
  const send=()=>request(url.href,{method:'GET',headers:{Authorization:'Bearer '+token.access_token,'X-Cafe24-Api-Version':c.version}});
  let r=await send();if(r.status===401){token=await accessToken(true,token.access_token);r=await send();}
  if(!r.ok){
   const errors:Record<number,[string,string,number]>={401:['reauthorize','카페24 연결을 다시 승인해 주세요.',409],403:['permission','카페24 주문 조회 권한을 확인해 주세요.',403],404:['not_found','카페24에서 주문을 찾지 못했습니다.',404],429:['rate_limit','조회 요청이 많습니다. 잠시 후 다시 조회해 주세요.',429]};
   const e=errors[r.status]||['upstream','카페24 조회에 실패했습니다. 잠시 후 다시 조회해 주세요.',502];throw new Cafe24Error(e[0] as string,e[1] as string,e[2] as number);
  }
  try{return await r.json();}catch{throw new Cafe24Error('invalid_response','카페24 응답을 읽지 못했습니다.');}
 }
 return {
  status,
  authorizeUrl(state:string){const c=conf(),url=new URL('/api/v2/oauth/authorize',origin());url.search=new URLSearchParams({response_type:'code',client_id:c.clientId,redirect_uri:c.redirectUri,scope:'mall.read_order',state}).toString();return url.href;},
  async exchange(code:string){await tokenRequest(new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:conf().redirectUri}));},
  async list(input:unknown):Promise<Cafe24OrderPage>{
   const q=cafe24Query.parse(input);const pageSize=50;
   const result=await get('orders',{start_date:q.start+'T00:00:00+09:00',end_date:q.end+'T23:59:59+09:00',date_type:'order_date',limit:String(pageSize),offset:String((q.page-1)*pageSize),embed:'items,buyer',...(q.orderId?{order_id:q.orderId}:{}),...(q.status?{order_status:q.status}:{})});
   const orders=readRows(result?.orders).map(normalizeOrder);
   return {orders,page:q.page,pageSize,hasMore:orders.length===pageSize,fetchedAt:new Date(now()).toISOString()};
  },
  async detail(idInput:unknown):Promise<Cafe24OrderDetail>{
   const id=cafe24OrderId.parse(idInput),path='orders/'+encodeURIComponent(id);
   // Separate read endpoints retain split shipments and multiple recipients.
   const orderResult=await get(path,{embed:'items,buyer'});
   const parsed=record.safeParse(orderResult?.order);if(!parsed.success)throw new Cafe24Error('invalid_response','카페24 주문 상세를 읽지 못했습니다.');
   const receiverResult=await get(path+'/receivers');const shipmentResult=await get(path+'/shipments');
   return {order:normalizeOrder(parsed.data),receivers:readRows(receiverResult?.receivers).map(r=>({shippingCode:text(r.shipping_code),name:text(r.name),phone:text(r.phone),cellphone:text(r.cellphone)||text(r.virtual_phone_no),zipcode:text(r.zipcode),address:text(r.address_full)||[text(r.address1),text(r.address2)].filter(Boolean).join(' '),message:text(r.shipping_message)})),shipments:readRows(shipmentResult?.shipments).map(s=>({code:text(s.shipping_code),trackingNo:text(s.tracking_no),carrierCode:text(s.shipping_company_code),status:text(s.status),itemCodes:Array.isArray(s.items)?s.items.map(i=>typeof i==='string'?i:text(i?.order_item_code)):[]})),fetchedAt:new Date(now()).toISOString()};
  }
 };
}
