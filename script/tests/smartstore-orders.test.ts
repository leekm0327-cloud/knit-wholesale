import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import {createSmartstoreClient,smartstoreConfig,smartstoreQuery,normalizeSmartstoreOrder,SmartstoreError} from '../../server/smartstore-client';
import {registerSmartstoreRoutes} from '../../server/smartstore-routes';
const initial=Date.parse('2026-10-14T00:00:00Z');let clock=initial,mode='ok',tokenMode='ok',tokens=0;
const config={clientId:'aaaabbbbcccc',clientSecret:'$2a$10$abcdefghijklmnopqrstuv'};
assert.equal(Buffer.from(await bcrypt.hash('aaaabbbbcccc_1643961623299',config.clientSecret)).toString('base64'),'JDJhJDEwJGFiY2RlZmdoaWprbG1ub3BxcnN0dXVCVldZSk42T0VPdEx1OFY0cDQxa2IuTnpVaUEzbmsy','official Naver signature example');
const item={order:{orderId:'2026101400000011',ordererName:'테스트 구매자',orderDate:'2026-10-14T09:00:00+09:00',paymentDate:'2026-10-14T09:01:00+09:00'},productOrder:{productOrderId:'2026101400000022',productName:'테스트 원두',productOption:'150g / 홀빈',quantity:2,initialQuantity:2,remainQuantity:1,totalPaymentAmount:24000,initialPaymentAmount:24000,remainPaymentAmount:12000,productOrderStatus:'PAYED',claimStatus:'CANCEL_DONE',shippingAddress:{name:'가상 수령인',tel1:'010-0000-0000',zipCode:'00000',baseAddress:'가상 기본주소',detailedAddress:'가상 상세주소'},shippingMemo:'가상 배송 메모'},delivery:{deliveryCompany:'CJGLS',trackingNumber:'TEST-0001',deliveryStatus:'DELIVERING',isWrongTrackingNumber:true},currentClaim:{cancel:{claimStatus:'CANCEL_DONE'}}};
const calls:{path:string;method:string;body:string;auth:string}[]=[];
const fake:typeof fetch=async(input,init)=>{
 const url=new URL(String(input));const body=String(init?.body||'');calls.push({path:url.pathname+url.search,method:init?.method||'GET',body,auth:new Headers(init?.headers).get('Authorization')||''});
 if(url.pathname.endsWith('/oauth2/token')){tokens++;const p=new URLSearchParams(body);assert.equal(p.get('type'),'SELF');assert.equal(p.get('timestamp'),String(clock));assert.equal(p.get('client_id'),config.clientId);assert.ok(!body.includes(config.clientSecret),'raw secret is never sent');assert.equal(Buffer.from(p.get('client_secret_sign')!,'base64').toString(),await bcrypt.hash(config.clientId+'_'+clock,config.clientSecret));if(tokenMode==='bad')return new Response('{"access_token":"fake"}');return Response.json({access_token:'fake-token-'+tokens,expires_in:10800,token_type:'Bearer'});}
 if(mode==='401'&&new Headers(init?.headers).get('Authorization')==='Bearer fake-token-1')return Response.json({code:'GW.AUTHN'},{status:401});
 if(mode==='always401')return Response.json({code:'GW.AUTHN'},{status:401});
 if(mode==='other401')return Response.json({code:'OTHER'},{status:401});
 if(mode==='429')return Response.json({code:'RATE_LIMIT',message:'private-secret-and-customer-data'},{status:429});
 if(mode==='403')return Response.json({code:'GW.IP_NOT_ALLOWED',message:'private-secret-and-customer-data'},{status:403});
 if(mode==='bad')return Response.json({data:{contents:null}});
 if(url.pathname.endsWith('/query')){assert.deepEqual(JSON.parse(body),{productOrderIds:[item.productOrder.productOrderId],quantityClaimCompatibility:true});return Response.json({data:mode==='missing'?[]:[item]});}
 return Response.json({data:{contents:mode==='empty'?[]:[{content:item}],pagination:{hasNext:mode==='more'}}});
};
assert.equal(smartstoreConfig({}),null);assert.deepEqual(smartstoreConfig({NAVER_COMMERCE_CLIENT_ID:config.clientId,NAVER_COMMERCE_CLIENT_SECRET:config.clientSecret}),config);
assert.throws(()=>smartstoreConfig({NAVER_COMMERCE_CLIENT_ID:'id-only'}));assert.throws(()=>smartstoreConfig({NAVER_COMMERCE_CLIENT_ID:config.clientId,NAVER_COMMERCE_CLIENT_SECRET:'not-bcrypt-salt'}));
const q={date:'2026-10-14',page:2,status:'PAYED'};
for(const bad of [{...q,date:'2026-02-30'},{...q,page:0},{...q,page:1001},{...q,status:'MADE_UP'}])assert.equal(smartstoreQuery.safeParse(bad).success,false);
const client=createSmartstoreClient(config,fake,()=>clock);assert.equal(client.status().state,'ready');
const result=await Promise.all([client.list(q),client.list(q),client.detail(item.productOrder.productOrderId)]);assert.equal(tokens,1,'coalesce initial token acquisition');
assert.equal(client.status().state,'connected');assert.equal(result[0].orders[0].remainingAmount,12000);assert.equal(result[0].orders[0].remainingQuantity,1);assert.ok(!JSON.stringify(result[0]).includes('010-0000'),'summary omits recipient contacts');
const request=new URL('https://example.test'+calls.find(c=>c.path.includes('?'))!.path);assert.equal(request.searchParams.get('from'),'2026-10-14T00:00:00.000+09:00');assert.equal(request.searchParams.get('to'),'2026-10-14T23:59:59.999+09:00');assert.equal(request.searchParams.get('page'),'2');assert.equal(request.searchParams.get('rangeType'),'PAYED_DATETIME');assert.equal(request.searchParams.get('quantityClaimCompatibility'),'true');
const detail=result[2];assert.equal(detail.recipient.address,'가상 기본주소 가상 상세주소');assert.equal(detail.delivery.trackingNo,'TEST-0001');assert.equal(detail.delivery.wrongTracking,true);assert.equal(detail.hasClaims,true);
assert.equal(normalizeSmartstoreOrder({order:{},productOrder:{productOrderId:'2026101400000033'}}).amount,null,'missing amount must not appear as zero');
assert.throws(()=>normalizeSmartstoreOrder({productOrder:{productOrderId:2026101400000033}}),'numeric identifiers must not silently lose precision');
mode='more';assert.equal((await client.list(q)).hasMore,true);mode='empty';assert.equal((await client.list(q)).orders.length,0);mode='bad';await assert.rejects(()=>client.list(q),(e:any)=>e.code==='invalid_response');
mode='401';await Promise.all([client.list(q),client.list(q)]);assert.equal(tokens,2,'401 refresh is shared');
mode='always401';const before=calls.length;await assert.rejects(()=>client.list(q),(e:any)=>e.status===401);assert.equal(calls.length-before,3,'bounded retry: read, token, read');
mode='other401';const beforeOther=tokens;await assert.rejects(()=>client.list(q),(e:any)=>e.status===401);assert.equal(tokens,beforeOther,'only GW.AUTHN triggers renewal');
mode='429';await assert.rejects(()=>client.list(q),(e:any)=>e.status===429&&!e.message.includes('private-secret'));mode='403';await assert.rejects(()=>client.list(q),(e:any)=>e.status===403&&e.message.includes('IP')&&!e.message.includes('private-secret'));
mode='missing';await assert.rejects(()=>client.detail(item.productOrder.productOrderId),(e:any)=>e.status===404);mode='ok';clock+=4*3600000;const old=tokens;await Promise.all([client.list(q),client.list(q)]);assert.equal(tokens,old+1,'expiry refresh is shared');
tokenMode='bad';clock+=4*3600000;await assert.rejects(()=>client.list(q),(e:any)=>e.code==='invalid_response');tokenMode='ok';
const disconnected=createSmartstoreClient(null,fake);assert.equal(disconnected.status().state,'not_configured');await assert.rejects(()=>disconnected.list(q),(e:any)=>e.status===503);
assert.ok(calls.filter(x=>x.method==='POST').every(x=>x.path.endsWith('/oauth2/token')||x.path.endsWith('/product-orders/query')),'never issue order mutations');
const app=express();const admin:any=(r:any,s:any,n:any)=>r.get('x-test-role')==='admin'?n():s.sendStatus(403);registerSmartstoreRoutes(app,admin,{config,fetcher:fake,now:()=>clock});
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
try{let r=await fetch(base+'/api/admin/smartstore/orders?date=2026-10-14');assert.equal(r.status,403);r=await fetch(base+'/api/admin/smartstore/orders?date=2026-10-14',{headers:{'x-test-role':'admin'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');r=await fetch(base+'/api/admin/smartstore/orders?date=invalid',{headers:{'x-test-role':'admin'}});assert.equal(r.status,400);r=await fetch(base+'/api/admin/smartstore/orders/'+item.productOrder.productOrderId,{headers:{'x-test-role':'admin'}});assert.equal(r.status,200);assert.equal((await r.json()).delivery.trackingNo,'TEST-0001');r=await fetch(base+'/api/admin/smartstore/orders/12345678',{method:'POST',headers:{'x-test-role':'admin'}});assert.equal(r.status,404);console.log('Smartstore: official signature, auth cache/renewal, bounded 401 retry, KST dates, precision-safe IDs, partial claims, shipping, safe errors, access control and read-only endpoints passed.');}finally{server.close();}
