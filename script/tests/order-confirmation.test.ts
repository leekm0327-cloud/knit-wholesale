import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { customers, products, orders, customerPrices, productCategories } from '../../shared/schema';
import { confirmCustomerOrder, OrderConfirmationError } from '../../server/order-confirmation';
// Import storage only after forcing a brand-new disposable DB. Never start routes,
// seed, automation, or any notification / payment / supplier integration.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'knit-confirm-test-'));
const { db, sqlite } = await import('../../server/storage');
let checks = 0;
function test(name: string, fn: () => void) { fn(); checks++; console.log(`PASS ${name}`); }
const customer = db.insert(customers).values({email:'fixture@example.invalid',password:'fixture',businessName:'테스트 커피',managerName:'가상 담당자',phone:'000-0000-0000',defaultAddress:'테스트 배송지',createdAt:1}).returning().get();
const p = db.insert(products).values({name:'테스트 블렌드',category:'blend',price:10000,description:'',createdAt:1} as any).returning().get();
db.insert(productCategories).values({key:'blend',label:'블렌드',isBean:1}).run();
const body = (qty=5,price=10000) => ({items:[{productId:p.id,name:'테스트 블렌드',category:'blend',unitPrice:price,qty,amount:price*qty}],note:'문 앞',quickRequest:true});
const preview = (b=body()) => confirmCustomerOrder(db,customer.id,b).quote;
let serial=0;
const save = (b:any, revision:string) => confirmCustomerOrder(db,customer.id,{...b,confirmationRevision:revision},`TEST-${++serial}`);
function rejects(fn:()=>unknown,status:number) { assert.throws(fn,(e:any)=>e instanceof OrderConfirmationError && e.status===status); }
try {
 test('preview is read-only; latest amounts and VAT',()=>{const q=preview();assert.equal(q.totalAmount,55000);assert.equal(q.totalQty,5);assert.equal(db.select().from(orders).all().length,0);});
 test('missing revision blocks old clients without creating orders',()=>{rejects(()=>save(body(),''),409);assert.equal(db.select().from(orders).all().length,0);});
 test('bean minimum and product minimum',()=>{rejects(()=>preview(body(4)),400);db.update(products).set({minOrderQty:6}).where(eq(products.id,p.id)).run();rejects(()=>preview(),400);db.update(products).set({minOrderQty:0}).where(eq(products.id,p.id)).run();});
 test('customer price change detected; re-change blocks commit',()=>{const old=preview();db.insert(customerPrices).values({customerId:customer.id,productId:p.id,price:12001,createdAt:1,updatedAt:1}).run();rejects(()=>save(body(),old.revision),409);const q=preview();assert.deepEqual(q.priceChanges,['테스트 블렌드']);assert.equal(q.vat,6001);db.update(customerPrices).set({price:13000}).run();rejects(()=>save(body(),q.revision),409);});
 test('sold out and deleted product fail closed',()=>{db.update(products).set({available:0}).run();rejects(()=>preview(),409);db.update(products).set({available:1}).run();const b=body();b.items[0].productId=99999;rejects(()=>preview(b),409);});
 test('missing address can preview but cannot commit',()=>{for (const address of ['', '  \n\t ', '\u3000']) { db.update(customers).set({defaultAddress:address}).run();const q=preview();assert(q.missingAddress);rejects(()=>save(body(),q.revision),400); }db.update(customers).set({defaultAddress:'테스트 배송지'}).run();});
 test('delivery and notes changes invalidate confirmation',()=>{const q=preview();db.update(customers).set({phone:'000-0000-1111'}).run();rejects(()=>save(body(),q.revision),409);const q2=preview();rejects(()=>save({...body(),note:'changed'},q2.revision),409);});
 test('fresh quote stores exactly reviewed total',()=>{const q=preview();const r=save(body(),q.revision);assert.equal(r.order!.totalAmount,q.totalAmount);assert.equal(r.order!.desiredDate,'');assert.equal(r.order!.quickRequest,1);});
 test('same-day merge keeps previous price, discount, date, note and quick',()=>{
   const o=db.select().from(orders).get()!;
   db.update(orders).set({discountAmount:1000,desiredDate:'2030-01-01'}).where(eq(orders.id,o.id)).run();
   db.update(customerPrices).set({price:14000}).run();
   const b={...body(1),note:'추가 메모',quickRequest:false};const q=preview(b);
   assert.equal(q.totalQty,6);assert.equal(q.finalItems.length,2);assert.equal(q.supplyAmount,78000);assert.equal(q.totalAmount,85800);
   const r=save(b,q.revision);assert.equal(r.order!.id,o.id);assert.equal(r.order!.desiredDate,'2030-01-01');assert.equal(r.order!.quickRequest,1);assert.equal(r.order!.note,'문 앞\n[추가 주문] 추가 메모');assert.equal(db.select().from(orders).all().length,1);
 });
 test('merge target changes and replay are rejected',()=>{const b=body(1);const q=preview(b);db.update(orders).set({note:'관리자 변경'}).run();rejects(()=>save(b,q.revision),409);const q2=preview(b);save(b,q2.revision);rejects(()=>save(b,q2.revision),409);});
 test('sample, negative-line and non-today orders are excluded from merge',()=>{
   const o=db.select().from(orders).get()!;
   for (const patch of [{isSample:1},{isSample:0,items:JSON.stringify([{category:'blend',qty:-1}])},{items:o.items,createdAt:1}]) {
     db.update(orders).set(patch).run();assert.equal(preview().mergeOrderNo,null);rejects(()=>preview(body(1)),400);
   }
 });
 test('duplicate product cannot bypass minimum',()=>{const b=body(3);b.items.push({...b.items[0]});rejects(()=>preview(b),400);});
 test('invalid quantities and unsafe amounts cannot create orders',()=>{
   const count=db.select().from(orders).all().length;
   for (const qty of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,Number.MAX_SAFE_INTEGER]) rejects(()=>preview(body(qty)),400);
   assert.equal(db.select().from(orders).all().length,count);
 });
 test('original confirmation cannot replay after order completion or cancellation',()=>{
   const b=body(); const q=preview(b); const r=save(b,q.revision);
   const count=db.select().from(orders).all().length;
   for (const status of ['done','cancelled']) {db.update(orders).set({status}).where(eq(orders.id,r.order!.id)).run();rejects(()=>save(b,q.revision),409);}
   assert.equal(db.select().from(orders).all().length,count);
 });
 console.log(`${checks} scenario groups passed; isolated DB only; no external services imported.`);
} finally { sqlite.close(); }
