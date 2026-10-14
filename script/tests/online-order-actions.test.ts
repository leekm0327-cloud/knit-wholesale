import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createOrderActionStore} from '../../server/online-order-actions';
import {createSmartstoreClient} from '../../server/smartstore-client';
const db:any=new DatabaseSync(':memory:');db.transaction=(fn:()=>void)=>()=>{db.exec('BEGIN');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};const store=createOrderActionStore(db);let writes=0;
const req=(key=randomUUID(),body:any={action:'dispatch',confirmed:true})=>({body,protocol:'https',session:{userId:1},get:(k:string)=>({'Origin':'https://test.example','Host':'test.example','X-Order-Action-Key':key}[k])}) as any;
const success=async()=>{writes++;return {id:'12345678',outcome:'success' as const,message:'ok'};};
const r=req();await store.run(r,'naver','12345678',success);await store.run(r,'naver','12345678',success);assert.equal(writes,1);
await assert.rejects(()=>store.run(req(),'naver','12345678',success),/이미 처리/);
await assert.rejects(()=>store.run({...r,body:{action:'dispatch',confirmed:true,trackingNo:'other'}},'naver','12345678',success),/다른 내용/);
await assert.rejects(()=>store.run(req(undefined,{action:'dispatch',confirmed:false}),'naver','87654321',success),/먼저 확인/);
await assert.rejects(()=>store.run({...req(),get:(k:string)=>k==='Origin'?'https://evil.example':'test.example'},'naver','87654321',success),/관리자 화면/);
await store.run(req(),'naver','87654321',async()=>{throw new Error('timeout after upstream write');});
await assert.rejects(()=>store.run(req(),'naver','87654321',success),/이미 처리/);
assert.equal(store.history('naver','87654321')[0].outcome,'unknown');
const cfg={clientId:'test-client',clientSecret:'$2a$10$abcdefghijklmnopqrstuv'};
let place='NOT_YET',claim=false,fail=false;const calls:string[]=[];
const id='2026101212345678';
const fixture=()=>({order:{orderId:'2026101200000011'},productOrder:{productOrderId:id,productOrderStatus:'PAYED',placeOrderStatus:place},...(claim?{currentClaim:{x:1}}:{})});
const client=createSmartstoreClient(cfg,async(input,init)=>{const u=new URL(String(input));calls.push(u.pathname);
 if(u.pathname.endsWith('/token'))return Response.json({access_token:'fake',expires_in:10000});
 if(u.pathname.endsWith('/query'))return Response.json({data:[fixture()]});
 if(u.pathname.endsWith('/confirm')){if(fail)throw Error('timeout');return Response.json({data:{successProductOrderInfos:[{productOrderId:id}]}});}
 if(u.pathname.endsWith('/dispatch')){const b=JSON.parse(String(init?.body));assert.equal(b.dispatchProductOrders[0].trackingNumber,'1234567890');return Response.json({data:{successProductOrderIds:[id]}});}
 const d=u.searchParams.get('from')!.slice(0,10);return Response.json({data:{contents:d==='2026-10-12'?[{content:fixture()}]:[],pagination:{hasNext:d==='2026-10-12'&&u.searchParams.get('page')==='1'}}});
});
assert.equal((await client.action(id,{action:'confirm'})).outcome,'success');
place='OK';await assert.rejects(()=>client.action(id,{action:'confirm'}));
assert.equal((await client.action(id,{action:'dispatch',carrier:'CJGLS',trackingNo:'1234567890'})).outcome,'success');
claim=true;const before=calls.length;await assert.rejects(()=>client.action(id,{action:'dispatch',carrier:'CJGLS',trackingNo:'1234567890'}));assert.equal(calls.slice(before).filter(x=>x.endsWith('/dispatch')).length,0);
claim=false;place='NOT_YET';fail=true;await assert.rejects(()=>client.action(id,{action:'confirm'}));assert.equal(calls.filter(x=>x.endsWith('/confirm')).length,2,'failed mutation not retried');
const part=await client.range({start:'2026-10-08',end:'2026-10-14'});assert.deepEqual(part.next,{date:'2026-10-10',page:1});assert.equal(part.orders.length,2,'all upstream pages consumed before moving day');
await assert.rejects(()=>client.range({start:'2026-01-01',end:'2026-10-14'}));
db.close();console.log('Online actions: durable replay protection, ambiguous outcomes, origin/confirmation, current-state/claim guards, write no-retry, range pagination passed');
const {createCafe24Client}=await import('../../server/cafe24-client');
const cdb:any=new DatabaseSync(':memory:');const now=Date.now();let writeScope=false,cafeWrites=0,state='N10';
const cafe=createCafe24Client(cdb,{mallId:'testmall',shopNo:1,clientId:'testid',clientSecret:'fake',encryptionKey:Buffer.alloc(32),redirectUri:'https://test.example/api/admin/cafe24/callback',version:'2026-09-01'},async(input,init)=>{
 const u=new URL(String(input));
 if(u.pathname.endsWith('/token'))return Response.json({mall_id:'testmall',client_id:'testid',access_token:'fake',refresh_token:'fake-refresh',expires_at:new Date(now+7200000).toISOString(),refresh_token_expires_at:new Date(now+86400000).toISOString(),scopes:['mall.read_order',...(writeScope?['mall.write_order']:[])]});
 if(init?.method==='PUT'){cafeWrites++;const body=JSON.parse(String(init.body));assert.deepEqual(body,{shop_no:1,request:{process_status:'prepare',order_item_code:['item-1']}});return Response.json({order:body.request});}
 if(init?.method==='POST'){cafeWrites++;const body=JSON.parse(String(init.body));assert.equal(body.request.status,'shipping');return Response.json({shipments:[{...body.request,order_id:'order-1'}]});}
 if(u.pathname.endsWith('/receivers'))return Response.json({receivers:[{name:'test',shipping_code:'S1'}]});
 if(u.pathname.endsWith('/shipments'))return Response.json({shipments:[]});
 return Response.json({order:{order_id:'order-1',paid:'T',canceled:'F',items:[{order_item_code:'item-1',order_status:state,shipping_code:'S1'}]}});
},()=>now);
await cafe.exchange('fake');assert.equal(cafe.status().canWrite,false);
await assert.rejects(()=>cafe.action('order-1',{action:'confirm',itemCodes:['item-1']}),/권한/);assert.equal(cafeWrites,0);
writeScope=true;await cafe.exchange('fake');assert.equal(cafe.status().canWrite,true);
assert.equal((await cafe.action('order-1',{action:'confirm',itemCodes:['item-1']})).outcome,'success');
await assert.rejects(()=>cafe.action('order-1',{action:'dispatch',carrier:'0006',trackingNo:'1234567890',itemCodes:['item-1']}),/최신/);
state='N20';assert.equal((await cafe.action('order-1',{action:'dispatch',carrier:'0006',trackingNo:'1234567890',itemCodes:['item-1']})).outcome,'success');assert.equal(cafeWrites,2);
cdb.close();console.log('Cafe24 write scope, current item state, exact preparation and shipment payloads passed');
